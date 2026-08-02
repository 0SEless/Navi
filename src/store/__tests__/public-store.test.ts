import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { usePublicStore, search as searchEntries, nearestNode as nearestNodeOf } from '../public-store'
import type { NavNode, NavEdge, SearchEntry, CampusBundle } from '@/types/nav-types'

const graphFixture = {
  version: '1.0.0',
  campusId: 'test-campus',
  nodes: [
    { id: 'n1', label: 'Main Lobby', type: 'space', position: { lat: 10.0, lng: 20.0 }, floor: 0, buildingId: 'b1', properties: { category: 'lobby' } },
    { id: 'n2', label: 'Registrar Office', type: 'space', position: { lat: 10.001, lng: 20.0 }, floor: 0, buildingId: 'b1', properties: { category: 'office' } },
    { id: 'n3', label: 'Room 101', type: 'space', position: { lat: 10.002, lng: 20.0 }, floor: 1, buildingId: 'b1', properties: { category: 'classroom' } },
  ],
  edges: [
    { id: 'e1', from: 'n1', to: 'n2', type: 'walk', distance: 111, weight: 111 },
    { id: 'e2', from: 'n2', to: 'n3', type: 'walk', distance: 111, weight: 111 },
  ],
  metadata: { boundingBox: { minLat: 10, maxLat: 10.002, minLng: 20, maxLng: 20 } },
}

const searchFixture = {
  version: '1.0.0',
  entries: [
    { id: 's1', label: 'Main Building', type: 'building', nodeId: 'n1', tags: ['MAIN', 'administrative'], buildingId: 'b1' },
    { id: 's2', label: 'Main Lobby', type: 'room', nodeId: 'n1', tags: ['lobby'], buildingId: 'b1', floor: 0 },
    { id: 's3', label: 'Registrar Office', type: 'room', nodeId: 'n2', tags: ['101', 'office'], buildingId: 'b1', floor: 0 },
    { id: 's4', label: 'Room 101', type: 'room', nodeId: 'n3', tags: ['101', 'classroom'], buildingId: 'b1', floor: 1 },
  ],
}

const buildingsFixture = {
  version: '1.0.0',
  buildings: [
    {
      id: 'b1',
      name: 'Main Building',
      code: 'MAIN',
      category: 'administrative',
      position: { lat: 10.0, lng: 20.0 },
      floors: [
        { level: 0, label: 'Ground Floor', elevation: 0 },
        { level: 1, label: 'Second Floor', elevation: 4 },
      ],
      entrances: [{ id: 'ent1', label: 'Main Entrance', position: { lat: 10.0, lng: 20.0 } }],
    },
  ],
}

const poiFixture = {
  version: '1.0.0',
  points: [
    { id: 'poi-1', label: 'Main Lobby', category: 'space', position: { lat: 10.0, lng: 20.0 }, buildingId: 'b1', floor: 0, nodeId: 'n1' },
  ],
}

const fixtureNodes: NavNode[] = [
  { id: 'n1', label: 'Main Lobby', position: { lat: 10.0, lng: 20.0 }, floor: 0, buildingId: 'b1', campusId: 'test-campus', type: 'room' },
  { id: 'n2', label: 'Registrar Office', position: { lat: 10.001, lng: 20.0 }, floor: 0, buildingId: 'b1', campusId: 'test-campus', type: 'room' },
  { id: 'n3', label: 'Room 101', position: { lat: 10.002, lng: 20.0 }, floor: 1, buildingId: 'b1', campusId: 'test-campus', type: 'room' },
]

const fixtureEdges: NavEdge[] = [
  { id: 'e1', from: 'n1', to: 'n2', distance: 111, weight: 111, type: 'walk' },
  { id: 'e2', from: 'n2', to: 'n3', distance: 111, weight: 111, type: 'walk' },
]

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

function stubFetch(handler: (url: string) => Promise<Response>) {
  const fn = vi.fn((url: string) => handler(url))
  vi.stubGlobal('fetch', fn)
  return fn
}

function makeBundle(overrides: Partial<CampusBundle> = {}): CampusBundle {
  return {
    nodes: fixtureNodes,
    edges: fixtureEdges,
    searchEntries: [],
    buildings: [],
    poi: [],
    boundingBox: null,
    ...overrides,
  }
}

describe('usePublicStore campus data layer', () => {
  beforeEach(() => {
    usePublicStore.setState({
      activeTab: 'home',
      sheetState: 'hidden',
      mapMode: 'explore',
      fromNode: null,
      toNode: null,
      selectedBuilding: null,
      selectedNode: null,
      campusData: null,
      campusStatus: 'idle',
      campusError: null,
      activeFloor: 0,
      campus: null,
      campusLoading: false,
      recentDestinations: [],
      recentSearches: [],
      onboardingComplete: false,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads a bundle via /api/campus-maps', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.includes('/api/campus-maps')) return jsonResponse(graphFixture)
      return jsonResponse({ error: 'not found' }, 404)
    })

    await usePublicStore.getState().fetchCampusData()

    const state = usePublicStore.getState()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(state.campus).not.toBeNull()
    expect(state.campus!.nodes).toHaveLength(3)
    expect(state.campus!.edges).toHaveLength(2)
    expect(state.campus!.boundingBox).toEqual({ minLat: 10, maxLat: 10.002, minLng: 20, maxLng: 20 })
    expect(state.campus!.nodes[0].type).toBe('room')
    expect(state.campus!.nodes[0].metadata).toEqual({ category: 'lobby' })
    expect(state.campusLoading).toBe(false)
    expect(state.campusStatus).toBe('ready')
    expect(state.campusError).toBeNull()
    expect(state.campusData?.source).toBe('supabase')
    expect(state.campusData?.nodes).toHaveLength(3)
    expect(state.activeFloor).toBe(0)
  })

  it('falls back to /api/demo/artifacts when campus-maps has no data', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.includes('/api/campus-maps')) return jsonResponse({ maps: [] })
      if (url.includes('file=navigation.graph.json')) return jsonResponse(graphFixture)
      if (url.includes('file=search.index.json')) return jsonResponse(searchFixture)
      if (url.includes('file=building-index.json')) return jsonResponse(buildingsFixture)
      if (url.includes('file=poi.json')) return jsonResponse(poiFixture)
      return jsonResponse({ error: 'not found' }, 404)
    })

    await usePublicStore.getState().fetchCampusData()

    const state = usePublicStore.getState()
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls[0]).toContain('/api/campus-maps')
    expect(urls.some((u) => u.includes('file=navigation.graph.json'))).toBe(true)
    expect(state.campus).not.toBeNull()
    expect(state.campus!.nodes).toHaveLength(3)
    expect(state.campus!.nodes[0].campusId).toBe('test-campus')
    expect(state.campus!.searchEntries).toHaveLength(4)
    expect(state.campus!.buildings).toHaveLength(1)
    expect(state.campus!.buildings[0].floors).toEqual([0, 1])
    expect(state.campus!.buildings[0].entrances?.[0].id).toBe('ent1')
    expect(state.campus!.poi).toHaveLength(1)
    expect(state.campusData?.source).toBe('demo')
    expect(state.campusStatus).toBe('ready')
  })

  it('sets campusError when every source fails', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ error: 'boom' }, 500))

    await usePublicStore.getState().fetchCampusData()

    const state = usePublicStore.getState()
    expect(fetchMock).toHaveBeenCalled()
    expect(state.campus).toBeNull()
    expect(state.campusLoading).toBe(false)
    expect(state.campusStatus).toBe('error')
    expect(state.campusError).toBe('No campus data available from any source')
  })

  it('skips a malformed artifact and keeps the rest', async () => {
    stubFetch((url) => {
      if (url.includes('/api/campus-maps')) return jsonResponse({ maps: [] })
      if (url.includes('file=navigation.graph.json')) return jsonResponse({ version: '1.0.0' })
      if (url.includes('file=search.index.json')) return jsonResponse(searchFixture)
      if (url.includes('file=building-index.json')) return jsonResponse(buildingsFixture)
      if (url.includes('file=poi.json')) return jsonResponse(poiFixture)
      return jsonResponse({ error: 'not found' }, 404)
    })

    await usePublicStore.getState().fetchCampusData()

    const state = usePublicStore.getState()
    expect(state.campus).not.toBeNull()
    expect(state.campus!.nodes).toHaveLength(0)
    expect(state.campus!.edges).toHaveLength(0)
    expect(state.campus!.boundingBox).toBeNull()
    expect(state.campus!.searchEntries).toHaveLength(4)
    expect(state.campus!.buildings).toHaveLength(1)
    expect(state.campus!.poi).toHaveLength(1)
    expect(state.campusStatus).toBe('ready')
  })

  it('ranks search results: startsWith, then contains, then tag', () => {
    const entries: SearchEntry[] = [
      { id: 'a', label: 'Lab Building', type: 'building', nodeId: 'n0' },
      { id: 'b', label: 'Computer Lab', type: 'room', nodeId: 'n1' },
      { id: 'c', label: 'Computer Room', type: 'room', nodeId: 'n2', tags: ['LAB', 'x'] },
      { id: 'd', label: 'Library', type: 'building', nodeId: 'n3' },
    ]
    usePublicStore.setState({ campus: makeBundle({ searchEntries: entries }) })

    const results = usePublicStore.getState().search('lab')
    expect(results.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('search is case-insensitive', () => {
    const entries: SearchEntry[] = [
      { id: 'a', label: 'Main Lobby', type: 'room', nodeId: 'n1' },
      { id: 'b', label: 'Lobby Annex', type: 'room', nodeId: 'n2' },
    ]
    usePublicStore.setState({ campus: makeBundle({ searchEntries: entries }) })

    const results = usePublicStore.getState().search('LOBBY')
    expect(results.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('search caps results at 20 and matches tags', () => {
    const entries: SearchEntry[] = Array.from({ length: 25 }, (_, i) => ({
      id: `r${i}`,
      label: `Room ${i}`,
      type: 'room' as const,
      nodeId: `n${i}`,
    }))
    entries.push({ id: 't', label: 'Auditorium', type: 'room', nodeId: 'n99', tags: ['room-99'] })
    usePublicStore.setState({ campus: makeBundle({ searchEntries: entries }) })

    const results = usePublicStore.getState().search('room')
    expect(results).toHaveLength(20)
    const tagHit = searchEntries(entries, 'auditorium')
    expect(tagHit.map((r) => r.id)).toEqual(['t'])
    expect(searchEntries(entries, '')).toEqual([])
  })

  it('findRoute returns a PathResult with steps for a connected pair', () => {
    usePublicStore.setState({ campus: makeBundle() })

    const result = usePublicStore.getState().findRoute('n1', 'n3')
    expect(result).not.toBeNull()
    expect(result!.path).toEqual(['n1', 'n2', 'n3'])
    expect(result!.cost).toBe(222)
    expect(result!.steps).toHaveLength(3)
    expect(result!.steps[0].nodeId).toBe('n1')
    expect(result!.steps[2].nodeId).toBe('n3')
    expect(typeof result!.steps[1].instruction).toBe('string')
  })

  it('findRoute returns null for a disconnected pair', () => {
    const nodes = [...fixtureNodes, { ...fixtureNodes[0], id: 'n9', label: 'Isolated' }]
    usePublicStore.setState({ campus: makeBundle({ nodes }) })

    expect(usePublicStore.getState().findRoute('n1', 'n9')).toBeNull()
  })

  it('nearestNode returns the closest node within maxDistance', () => {
    usePublicStore.setState({ campus: makeBundle() })

    const result = usePublicStore.getState().nearestNode({ lat: 10.0014, lng: 20.0 })
    expect(result?.id).toBe('n2')
    expect(result).toEqual(
      nearestNodeOf(fixtureNodes, { lat: 10.0014, lng: 20.0 }),
    )
  })

  it('nearestNode returns null beyond maxDistance', () => {
    usePublicStore.setState({ campus: makeBundle() })

    expect(usePublicStore.getState().nearestNode({ lat: 10.0005, lng: 20.0 })).toBeNull()
    expect(usePublicStore.getState().nearestNode({ lat: 10.0002, lng: 20.0 }, 100)?.id).toBe('n1')
  })

  it('is a no-op when campus is already loaded', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.includes('/api/campus-maps')) return jsonResponse(graphFixture)
      return jsonResponse({ error: 'not found' }, 404)
    })

    await usePublicStore.getState().fetchCampusData()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await usePublicStore.getState().fetchCampusData()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is a no-op while loading', async () => {
    const fetchMock = stubFetch(() => jsonResponse(graphFixture))
    usePublicStore.setState({ campusLoading: true })

    await usePublicStore.getState().fetchCampusData()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(usePublicStore.getState().campusLoading).toBe(true)
  })
})
