import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { EditorBridge } from '@/components/studio/EditorBridge'
import type { EditorContext } from '@navi/editor'
import { Graph } from '@/engine/graph'
import { useGraphStore, __resetGraphSaveQueuesForTests } from '../graph-store'
import { validateRouteNetwork } from '../../../packages/editor/src/validation/rules/modules/route-network'

const MAP_ID = 'building-color-routing-persistence'
const ROUTE_NODE_COUNT = 197
const ROUTE_EDGE_COUNT = 218

interface SavePayload extends Record<string, unknown> {
  forceServerOverwrite?: boolean
  buildings?: Array<{ id: string; color?: string; name?: string }>
  nodes?: Array<{ id: string }>
  edges?: Array<{ id: string; from: string; to: string }>
}

function makeLegacyGraph(): Graph {
  const graph = new Graph()
  graph.campusId = MAP_ID
  graph.addBuilding({
    id: 'building-a',
    name: 'Color Me',
    campusId: MAP_ID,
    footprint: [
      { lat: 14.599, lng: 120.999 },
      { lat: 14.601, lng: 120.999 },
      { lat: 14.601, lng: 121.001 },
      { lat: 14.599, lng: 121.001 },
    ],
    floors: [0],
    floorData: [{ id: 'floor-a-0', level: 0 }],
    baseElevation: 0,
    height: 12,
    color: '#336699',
  } as never)
  graph.addBuilding({
    id: 'building-b',
    name: 'Second Building',
    campusId: MAP_ID,
    footprint: [],
    floors: [],
    floorData: [],
    baseElevation: 0,
    height: 12,
  } as never)

  const localPositions = Array.from({ length: ROUTE_NODE_COUNT }, (_, index) => {
    const angle = (index / ROUTE_NODE_COUNT) * Math.PI * 2
    return { x: Math.cos(angle) * 50, y: Math.sin(angle) * 50 }
  })
  const origin = { lat: 14.6, lng: 121 }
  const metersPerDegree = 111320
  graph.setNodes(localPositions.map((position, index) => ({
    id: `N-route-route-node-${index}`,
    label: 'Route waypoint',
    type: 'intersection',
    position: {
      lat: origin.lat + position.y / metersPerDegree,
      lng: origin.lng + position.x / (metersPerDegree * Math.cos((origin.lat * Math.PI) / 180)),
    },
    floor: 0,
    buildingId: 'building-a',
    campusId: MAP_ID,
    metadata: { routeNodeId: `route-node-${index}`, routeNodeType: 'waypoint' },
  })))

  const edgePairs: Array<[number, number]> = Array.from({ length: ROUTE_NODE_COUNT }, (_, index) => [
    index,
    (index + 1) % ROUTE_NODE_COUNT,
  ])
  for (let index = 0; edgePairs.length < ROUTE_EDGE_COUNT; index += 1) {
    edgePairs.push([index, (index + 47) % ROUTE_NODE_COUNT])
  }
  graph.setEdges(edgePairs.map(([fromIndex, toIndex], index) => {
    const from = localPositions[fromIndex]
    const to = localPositions[toIndex]
    return {
      id: `E-route-route-edge-${index}`,
      from: `N-route-route-node-${fromIndex}`,
      to: `N-route-route-node-${toIndex}`,
      distance: Math.hypot(to.x - from.x, to.y - from.y),
      type: 'walkway',
      campusId: MAP_ID,
    }
  }))

  return graph
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function routeNetworkFrom(document: NonNullable<ReturnType<typeof useGraphStore.getState>['authoredDocument']>) {
  return document.buildings.find((building) => building.id === 'building-a')!.floors[0].routeNetwork!
}

describe('legacy route graph survives ordinary building edits and normal save', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    __resetGraphSaveQueuesForTests()
    useGraphStore.setState({
      graph: new Graph(),
      currentMapId: null,
      authoredDocument: null,
      pendingAuthoredMutations: [],
      syncStatus: 'idle',
      syncError: null,
      campusReady: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('migrates 197 legacy route nodes/218 edges before color save, keeps later edits and reload stable', async () => {
    let serverSnapshot: Record<string, unknown> = {}
    let revision = 0
    const posted: SavePayload[] = []
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as SavePayload
        posted.push(body)
        serverSnapshot = structuredClone(body)
        revision += 1
        return jsonResponse({ success: true, updatedAt: `R${revision}` })
      }
      return jsonResponse({ ...structuredClone(serverSnapshot), updatedAt: `R${revision}` })
    })
    vi.stubGlobal('fetch', fetchMock)

    const graph = makeLegacyGraph()
    useGraphStore.setState({ graph, currentMapId: MAP_ID })
    await useGraphStore.getState().save()
    expect(posted).toHaveLength(1)
    expect(graph.nodes).toHaveLength(ROUTE_NODE_COUNT)
    expect(graph.edges).toHaveLength(ROUTE_EDGE_COUNT)

    const guardWarning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<EditorBridge><div /></EditorBridge>)
    const context = (window as unknown as { __naviContext: EditorContext }).__naviContext
    const dispatcher = context.services.get('dispatcher') as {
      status: string
      execute: (command: { id: string; label: string; payload: Record<string, unknown> }) => { success: boolean; error?: string }
    }
    const workflowStore = context.services.get('workflowStore') as {
      getSnapshot: () => { saveState: string }
    }
    await waitFor(() => expect(dispatcher.status).toBe('ready'))
    await waitFor(() => expect(workflowStore.getSnapshot().saveState).toBe('saved'))

    const originalNodeIds = graph.nodes.map((node) => node.id).sort()
    const originalEdgeIds = graph.edges.map((edge) => edge.id).sort()
    expect(graph.nodes).toHaveLength(ROUTE_NODE_COUNT)
    expect(graph.edges).toHaveLength(ROUTE_EDGE_COUNT)
    vi.useFakeTimers()

    act(() => {
      expect(dispatcher.execute({
        id: 'entity.update',
        label: 'Change Building Color',
        payload: { entityId: 'building-a', changes: { color: '#EF4444' } },
      }).success).toBe(true)
    })

    const afterColorEdit = useGraphStore.getState().graph
    expect(afterColorEdit.nodes).toHaveLength(ROUTE_NODE_COUNT)
    expect(afterColorEdit.edges).toHaveLength(ROUTE_EDGE_COUNT)
    expect(afterColorEdit.nodes.map((node) => node.id).sort()).toEqual(originalNodeIds)
    expect(afterColorEdit.edges.map((edge) => edge.id).sort()).toEqual(originalEdgeIds)
    expect(afterColorEdit.edges.every((edge) => afterColorEdit.getNode(edge.from) && afterColorEdit.getNode(edge.to))).toBe(true)
    expect(validateRouteNetwork(context.document, 'publish')).toEqual([])

    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(posted).toHaveLength(2)
    expect(posted[1].forceServerOverwrite).toBe(false)
    expect(posted[1].buildings.find((building: { id: string }) => building.id === 'building-a')?.color).toBe('#EF4444')
    expect(posted[1].nodes).toHaveLength(ROUTE_NODE_COUNT)
    expect(posted[1].edges).toHaveLength(ROUTE_EDGE_COUNT)
    expect(posted[1].nodes?.map((node) => node.id).sort()).toEqual(originalNodeIds)
    expect(posted[1].edges?.map((edge) => edge.id).sort()).toEqual(originalEdgeIds)
    const savedNodeIds = new Set(posted[1].nodes?.map((node) => node.id))
    expect(posted[1].edges?.every((edge) => savedNodeIds.has(edge.from) && savedNodeIds.has(edge.to))).toBe(true)
    expect(guardWarning.mock.calls.some(([message]) => String(message).includes('save blocked by safety guard'))).toBe(false)

    act(() => {
      expect(dispatcher.execute({
        id: 'entity.update',
        label: 'Edit Another Building',
        payload: { entityId: 'building-b', changes: { name: 'Second Building Edited' } },
      }).success).toBe(true)
    })
    expect(useGraphStore.getState().graph.nodes).toHaveLength(ROUTE_NODE_COUNT)
    expect(useGraphStore.getState().graph.edges).toHaveLength(ROUTE_EDGE_COUNT)
    expect(useGraphStore.getState().graph.nodes.map((node) => node.id).sort()).toEqual(originalNodeIds)
    expect(useGraphStore.getState().graph.edges.map((edge) => edge.id).sort()).toEqual(originalEdgeIds)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(posted).toHaveLength(3)
    expect(posted[2].buildings.find((building: { id: string }) => building.id === 'building-b')?.name).toBe('Second Building Edited')

    const routeNode = routeNetworkFrom(context.document).nodes[0]
    const oldPosition = { ...routeNode.position }
    const oldGraphPosition = { ...graph.getNode(`N-route-${routeNode.id}`)!.position }
    const oldIncidentDistance = routeNetworkFrom(context.document).edges.find((edge) => edge.from === routeNode.id || edge.to === routeNode.id)!.distance
    act(() => {
      expect(dispatcher.execute({
        id: 'route.node.update',
        label: 'Move Route Node',
        payload: { nodeId: routeNode.id, patch: { position: { x: oldPosition.x + 5, y: oldPosition.y + 2 } } },
      }).success).toBe(true)
    })
    const afterRouteEdit = useGraphStore.getState().graph
    expect(afterRouteEdit.nodes).toHaveLength(ROUTE_NODE_COUNT)
    expect(afterRouteEdit.edges).toHaveLength(ROUTE_EDGE_COUNT)
    expect(afterRouteEdit.nodes.map((node) => node.id).sort()).toEqual(originalNodeIds)
    expect(afterRouteEdit.edges.map((edge) => edge.id).sort()).toEqual(originalEdgeIds)
    expect(afterRouteEdit.getNode(`N-route-${routeNode.id}`)?.position).not.toEqual(
      oldGraphPosition,
    )
    expect(routeNetworkFrom(context.document).edges.find((edge) => edge.from === routeNode.id || edge.to === routeNode.id)!.distance).not.toBe(oldIncidentDistance)
    expect(validateRouteNetwork(context.document, 'publish')).toEqual([])
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(posted).toHaveLength(4)
    expect(posted[3].forceServerOverwrite).toBe(false)

    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(posted).toHaveLength(4)
    expect(useGraphStore.getState().syncStatus).toBe('synced')
    expect(workflowStore.getSnapshot().saveState).toBe('saved')
    expect(guardWarning.mock.calls.some(([message]) => String(message).includes('save blocked by safety guard'))).toBe(false)

    cleanup()
    vi.useRealTimers()
    useGraphStore.setState({
      graph: new Graph(),
      currentMapId: null,
      authoredDocument: null,
      pendingAuthoredMutations: [],
      syncStatus: 'idle',
      syncError: null,
      campusReady: false,
    })
    act(() => useGraphStore.getState().loadMapData(MAP_ID))
    await waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('synced'))
    const reloaded = useGraphStore.getState()
    expect(reloaded.graph.nodes).toHaveLength(ROUTE_NODE_COUNT)
    expect(reloaded.graph.edges).toHaveLength(ROUTE_EDGE_COUNT)
    expect(reloaded.authoredDocument?.buildings.find((building) => building.id === 'building-a')?.color).toBe('#EF4444')
    expect(reloaded.authoredDocument?.buildings.find((building) => building.id === 'building-b')?.name).toBe('Second Building Edited')
    expect(routeNetworkFrom(reloaded.authoredDocument!).nodes).toHaveLength(ROUTE_NODE_COUNT)
    expect(routeNetworkFrom(reloaded.authoredDocument!).edges).toHaveLength(ROUTE_EDGE_COUNT)
    expect(routeNetworkFrom(reloaded.authoredDocument!).nodes.some((node) => node.id === routeNode.id && node.position.x === oldPosition.x + 5)).toBe(true)
    expect(validateRouteNetwork(reloaded.authoredDocument!, 'publish')).toEqual([])
  }, 30000)
})
