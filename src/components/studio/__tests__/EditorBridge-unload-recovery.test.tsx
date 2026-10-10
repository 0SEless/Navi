import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditor, type EditorContext } from '@navi/editor'
import { Graph } from '@/engine/graph'
import { __resetGraphSaveQueuesForTests, useGraphStore } from '@/store/graph-store'
import { ackForRequest } from '@/test-utils/persistence-ack'
import { EditorBridge } from '../EditorBridge'
vi.mock('@/services/compiler-adapter', () => ({ createCompilerAdapter: () => ({}) }))
const campus = 'unload-recovery-campus'
let context: EditorContext
function Capture() { const editor = useEditor(); useEffect(() => { context = editor }, [editor]); return null }
describe('tab-close recovery checkpoint', () => {
  beforeEach(() => {
    localStorage.clear(); __resetGraphSaveQueuesForTests()
    const graph = new Graph(); graph.campusId = campus
    const document = { schemaVersion: 1, version: 0, metadata: { campusId: campus, name: 'Large', description: 'Authoring '.repeat(15000), lastModified: '', editorVersion: '' }, buildings: [], roads: [], panoramas: [], qrCheckpoints: [] }
    useGraphStore.setState({ graph, authoredDocument: document, currentMapId: campus, syncStatus: 'synced', syncError: null, pendingAuthoredMutations: [], serverAdoptionVersion: 0 })
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
  it('synchronously retains a large full document without starting a keepalive POST or claiming saved', async () => {
    const fetcher = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetcher)
    const mounted = render(<EditorBridge><Capture /></EditorBridge>)
    await waitFor(() => expect(context.services.get('autosave')?.status).toBe('ready'))
    act(() => { context.services.get('dispatcher')!.execute({ id: 'boundary.set', label: 'Boundary', payload: { points: [{ lat: 1, lng: 1 }, { lat: 1, lng: 2 }, { lat: 2, lng: 2 }] } }) })
    act(() => { window.dispatchEvent(new Event('beforeunload', { cancelable: true })) })
    const cached = localStorage.getItem(`navi-graph-${campus}`)!
    expect(cached.length).toBeGreaterThan(60000)
    expect(JSON.parse(cached).authoredDocument.boundary).toBeDefined()
    expect(fetcher).not.toHaveBeenCalled()
    expect(useGraphStore.getState().syncStatus).not.toBe('synced')
    expect(useGraphStore.getState().pendingAuthoredMutations.length).toBeGreaterThan(0)
    mounted.unmount()
  })
  it('requests browser leave confirmation if the recovery checkpoint cannot be written', async () => {
    const fetcher = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetcher)
    const mounted = render(<EditorBridge><Capture /></EditorBridge>)
    await waitFor(() => expect(context.services.get('autosave')?.status).toBe('ready'))
    act(() => { context.services.get('dispatcher')!.execute({ id: 'boundary.set', label: 'Boundary', payload: { points: [{ lat: 1, lng: 1 }, { lat: 1, lng: 2 }, { lat: 2, lng: 2 }] } }) })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const event = new Event('beforeunload', { cancelable: true })
    act(() => { window.dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(true)
    expect(useGraphStore.getState().syncStatus).toBe('error')
    expect(useGraphStore.getState().pendingAuthoredMutations.length).toBeGreaterThan(0)
    expect(context.document.boundary).toBeDefined()
    expect(fetcher).not.toHaveBeenCalled()
    mounted.unmount()
  })

  it('does not create a second authored save when a clean editor becomes hidden', async () => {
    const postBodies: string[] = []
    const document = useGraphStore.getState().authoredDocument!
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') postBodies.push(String(init.body))
      return new Response(JSON.stringify(ackForRequest(init, 'R2')), {
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetcher)
    const mounted = render(<EditorBridge><Capture /></EditorBridge>)
    await waitFor(() => expect(context.services.get('autosave')?.status).toBe('ready'))

    act(() => {
      context.services.get('dispatcher')!.execute({
        id: 'boundary.set',
        label: 'Boundary',
        payload: { points: [{ lat: 1, lng: 1 }, { lat: 1, lng: 2 }, { lat: 2, lng: 2 }] },
      })
    })
    await act(async () => { await context.services.get('persistence')!.save() })
    expect(postBodies).toHaveLength(1)
    expect(useGraphStore.getState().pendingAuthoredMutations).toHaveLength(0)

    const domDocument = globalThis.document
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(domDocument, 'visibilityState')
    Object.defineProperty(domDocument, 'visibilityState', { configurable: true, value: 'hidden' })
    await act(async () => { domDocument.dispatchEvent(new Event('visibilitychange')) })
    if (visibilityDescriptor) Object.defineProperty(domDocument, 'visibilityState', visibilityDescriptor)

    expect(postBodies).toHaveLength(1)
    expect(useGraphStore.getState().pendingAuthoredMutations).toHaveLength(0)

    await act(async () => { window.dispatchEvent(new Event('beforeunload', { cancelable: true })) })
    expect(postBodies).toHaveLength(1)
    expect(useGraphStore.getState().pendingAuthoredMutations).toHaveLength(0)
    mounted.unmount()
  })
})
