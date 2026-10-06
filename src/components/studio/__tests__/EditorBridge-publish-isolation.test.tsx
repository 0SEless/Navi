import { useEffect } from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { useEditor, type EditorContext } from '@navi/editor'
import { Graph } from '@/engine/graph'
import { useGraphStore, __resetGraphSaveQueuesForTests } from '@/store/graph-store'
import { useCompiledGraphStore } from '@/store/compiled-graph-store'
import { fullSnapshotFingerprint } from '@/services/full-snapshot-identity'
import { EditorBridge } from '../EditorBridge'

vi.mock('@/services/compiler-adapter', () => ({ createCompilerAdapter: () => ({}) }))
let active: EditorContext
function Capture() { const editor = useEditor(); useEffect(() => { active = editor }, [editor]); return null }
const campus = 'publish-isolation-campus'
beforeEach(() => {
  localStorage.clear(); __resetGraphSaveQueuesForTests(); useCompiledGraphStore.getState().clear()
  const graph = new Graph(); graph.campusId = campus
  for (const id of ['route-a', 'route-b']) graph.addNode({ id, campusId: campus, buildingId: '__outdoor__', floor: 0, type: 'outdoor', label: id, position: { lat: 1, lng: 1 } } as never)
  graph.addEdge({ id: 'route-edge', from: 'route-a', to: 'route-b', campusId: campus, type: 'walkway', distance: 1, weight: 1 } as never)
  useGraphStore.setState({ graph, currentMapId: campus, serverAdoptionVersion: 0, syncStatus: 'synced', syncError: null, pendingAuthoredMutations: [], authoredDocument: { schemaVersion: 1, version: 0, metadata: { campusId: campus, name: 'Draft', description: '', lastModified: '', editorVersion: '' }, buildings: [], roads: [], panoramas: [], qrCheckpoints: [] } })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('keeps route identities and full authored draft unchanged when Publish emits a smaller derived graph', async () => {
  render(<EditorBridge><Capture /></EditorBridge>)
  await waitFor(() => expect(active.services.get('autosave')?.status).toBe('ready'))
  const state = useGraphStore.getState()
  const before = { ...state.graph.toJSON(), authoredDocument: state.authoredDocument }
  const fingerprint = fullSnapshotFingerprint(before)
  const save = vi.spyOn(state, 'save')
  const nodeWrite = vi.spyOn(state, 'setNodes')
  const edgeWrite = vi.spyOn(state, 'setEdges')
  const compiled = { campusId: campus, nodes: [{ id: 'derived-only', type: 'outdoor', floor: 0, position: { lat: 2, lng: 2 }, properties: {} }], edges: [] }
  await act(async () => { active.services.get('eventBus')!.emit('publish.completed', { navigationGraph: compiled } as never) })
  const after = useGraphStore.getState()
  expect(fullSnapshotFingerprint({ ...after.graph.toJSON(), authoredDocument: after.authoredDocument })).toBe(fingerprint)
  expect({ ...after.graph.toJSON(), updatedAt: undefined, authoredDocument: after.authoredDocument }).toEqual({ ...before, updatedAt: undefined })
  expect(after.authoredDocument).toEqual(before.authoredDocument)
  expect(after.graph.nodes.map(n => n.id)).toEqual(['route-a', 'route-b'])
  expect(after.graph.edges.map(e => e.id)).toEqual(['route-edge'])
  expect(nodeWrite).not.toHaveBeenCalled(); expect(edgeWrite).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
  expect(after.pendingAuthoredMutations).toEqual([])
  expect(useCompiledGraphStore.getState().nodes[0].id).toBe('derived-only')
})
