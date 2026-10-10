import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { StrictMode, useEffect } from 'react'
import { useEditor, type EditorContext } from '@navi/editor'
import { Graph } from '@/engine/graph'
import { useGraphStore, __resetGraphSaveQueuesForTests } from '@/store/graph-store'
import { ackForRequest } from '@/test-utils/persistence-ack'
import { EditorBridge } from '../EditorBridge'
vi.mock('@/services/compiler-adapter', () => ({ createCompilerAdapter: () => ({}) }))
const campus = 'map-adoption-campus'
const doc = (name: string) => ({ schemaVersion: 1, version: 0, metadata: { campusId: campus, name, description: '', lastModified: '', editorVersion: '' }, buildings: [], roads: [], panoramas: [], qrCheckpoints: [] })
function graph() { const g = new Graph(); g.campusId = campus; return g }
let active: EditorContext
function Capture() {
  const editor = useEditor()
  useEffect(() => { active = editor }, [editor])
  return <div>{editor.document.metadata.name}</div>
}
let posts: string[]
async function mount() {
  const result = render(<StrictMode><EditorBridge><Capture /></EditorBridge></StrictMode>)
  await waitFor(() => expect(active.services.get('autosave')?.status).toBe('ready'))
  return result
}
async function adopt(name: string, revision: number) {
  vi.stubGlobal('fetch', vi.fn(async (_: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(String(init.body)); return new Response(JSON.stringify(ackForRequest(init, `R${revision + 1}`))) }
    return new Response(JSON.stringify({ ...graph().toJSON(), authoredDocument: doc(name), updatedAt: `R${revision}` }))
  }))
  await act(async () => { await useGraphStore.getState().adoptServerSnapshot() })
}
const points = [{ lat: 1, lng: 1 }, { lat: 1, lng: 2 }, { lat: 2, lng: 2 }]
const command = { id: 'boundary.set', label: 'Set boundary', payload: { points } }
describe('Map context authoritative adoption fencing', () => {
  beforeEach(() => {
    localStorage.clear(); __resetGraphSaveQueuesForTests(); posts = []
    useGraphStore.setState({ graph: graph(), authoredDocument: doc('R1'), currentMapId: campus, serverAdoptionVersion: 0, syncStatus: 'synced', syncError: null, pendingAuthoredMutations: [] })
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks() })
  it('recreates R1→R2→R3 contexts and fences old single/batch/history commands', async () => {
    await mount()
    const r1 = active
    const oldDispatcher = r1.services.get('dispatcher')!
    await adopt('R2', 2)
    await waitFor(() => expect(active.document.metadata.name).toBe('R2'))
    expect(active).not.toBe(r1)
    const r2 = active
    const secondDispatcher = r2.services.get('dispatcher')!
    await adopt('R3', 3)
    await waitFor(() => expect(active.document.metadata.name).toBe('R3'))
    expect(oldDispatcher.execute(command).success).toBe(false)
    expect(oldDispatcher.execute(command, { skipHooks: true }).success).toBe(false)
    expect(secondDispatcher.executeBatch([command]).success).toBe(false)
    expect(active.document.boundary).toBeUndefined()
    expect(useGraphStore.getState().authoredDocument?.metadata.name).toBe('R3')
  })
  it('blocks retired manual saves and visibility/unload flushes; current commands still persist', async () => {
    const windowListener = vi.spyOn(window, 'addEventListener')
    const documentListener = vi.spyOn(document, 'addEventListener')
    await mount()
    const oldUnload = windowListener.mock.calls.find(([event]) => event === 'beforeunload')![1] as EventListener
    const oldVisibility = documentListener.mock.calls.find(([event]) => event === 'visibilitychange')![1] as EventListener
    const oldPersistence = active.services.get('persistence')!
    const oldDispatcher = active.services.get('dispatcher')!
    await act(async () => { oldDispatcher.execute(command) })
    await adopt('R2', 2)
    await waitFor(() => expect(active.document.metadata.name).toBe('R2'))
    await expect(oldPersistence.save()).rejects.toThrow()
    await act(async () => {
      oldUnload(new Event('beforeunload'))
      oldVisibility(new Event('visibilitychange'))
    })
    // Captured retired listeners cannot sync the old document into R2.
    expect(posts).toHaveLength(0)
    await act(async () => { active.services.get('dispatcher')!.execute(command) })
    await act(async () => { await active.services.get('persistence')!.save() })
    expect(posts).toHaveLength(1)
    expect(JSON.parse(posts[0]).authoredDocument.metadata.name).toBe('R2')
    expect(useGraphStore.getState().syncStatus).toBe('synced')
  })
  it('discards a retired Map save ACK while preserving the adopted context and revision', async () => {
    await mount()
    await act(async () => { active.services.get('dispatcher')!.execute(command) })
    const oldPersistence = active.services.get('persistence')!
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.stubGlobal('fetch', vi.fn(async (_: unknown, init?: RequestInit) => {
      if (init?.method !== 'POST') return new Response(JSON.stringify({ ...graph().toJSON(), authoredDocument: doc('R2'), updatedAt: 'R2' }))
      await gate
      return new Response(JSON.stringify(ackForRequest(init, 'old-save-revision')))
    }))
    let saving!: Promise<void>
    await act(async () => { saving = oldPersistence.save().catch(() => {}) })
    await act(async () => {
      const adopting = useGraphStore.getState().adoptServerSnapshot()
      release()
      await adopting
    })
    await waitFor(() => expect(active.document.metadata.name).toBe('R2'))
    const adoptedMarker = localStorage.getItem(`navi-sync-status-${campus}`)
    await act(async () => { release(); await saving })
    expect(active.document.metadata.name).toBe('R2')
    expect(useGraphStore.getState().syncStatus).toBe('synced')
    expect(localStorage.getItem(`navi-sync-status-${campus}`)).toBe(adoptedMarker)
  })
})
