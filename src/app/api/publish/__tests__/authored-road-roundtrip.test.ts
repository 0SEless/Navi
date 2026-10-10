// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { CampusDocument, Road } from '@navi/core'

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }))
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

import { createServerClient } from '@supabase/ssr'
import { buildArtifacts } from '../../../../../packages/compiler/src/emitter/artifacts'
import { GET } from '../../public-campus/route'
import { createMemoryCampusCacheRepository } from '@/features/public-campus/cache'
import { createPublicStore } from '@/store/public-store'
import { POST } from '../route'

type PublishedRow = { campus_id: string; revision: number; artifacts: Record<string, unknown> }

function makePublishedClient() {
  const state: { row: PublishedRow | null } = { row: null }
  const client = {
    from: vi.fn((table: string) => {
      if (table !== 'published_maps') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
      }

      let operation: 'select' | 'update' | 'insert' = 'select'
      let payload: PublishedRow | null = null
      const conditions: Array<[string, unknown, 'eq' | 'lt']> = []
      const query = {
        select: () => {
          if (operation === 'select') return query
          if (operation === 'insert') {
            if (state.row) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate' } })
            state.row = payload
            return Promise.resolve({ data: state.row ? [state.row] : [], error: null })
          }
          const matches = state.row !== null && conditions.every(([column, value, operator]) => {
            const actual = state.row?.[column as keyof PublishedRow]
            return operator === 'eq' ? actual === value : Number(actual) < Number(value)
          })
          if (matches) state.row = payload
          return Promise.resolve({ data: matches ? [state.row] : [], error: null })
        },
        maybeSingle: async () => ({ data: state.row, error: null }),
        update: (row: PublishedRow) => { operation = 'update'; payload = row; conditions.length = 0; return query },
        insert: (row: PublishedRow) => { operation = 'insert'; payload = row; conditions.length = 0; return query },
        eq: (column: string, value: unknown) => { conditions.push([column, value, 'eq']); return query },
        lt: (column: string, value: unknown) => { conditions.push([column, value, 'lt']); return query },
      }
      return query
    }),
  }
  return { client, state }
}

const MOCK_SESSION = Buffer.from(JSON.stringify({ id: 'mock-super-admin', role: 'super_admin' })).toString('base64')

describe('authored-road publish round trip', () => {
  const originalEnv = {
    mockAuth: process.env.NEXT_PUBLIC_MOCK_AUTH,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_MOCK_AUTH = 'true'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-sentinel'
    vi.mocked(createServerClient).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const [name, value] of Object.entries({
      NEXT_PUBLIC_MOCK_AUTH: originalEnv.mockAuth,
      NEXT_PUBLIC_SUPABASE_URL: originalEnv.supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: originalEnv.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: originalEnv.serviceRoleKey,
    })) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it('carries Studio Roads through compiler artifacts, published JSON, public API, and CampusBundle', async () => {
    const campusId = 'road-roundtrip-campus'
    const visibleRoad: Road = {
      id: 'road-library-walk',
      name: 'Library Walk',
      polyline: { points: [{ lat: 14, lng: 121 }, { lat: 14.001, lng: 121.002 }] },
      width: 3,
      surface: 'brick',
      type: 'pedestrian',
      displayMode: 'visible',
      routing: { feature: 'ramp', walkable: true },
      metadata: { source: 'studio' },
    }
    const navigationOnlyRoad: Road = {
      id: 'road-service-access',
      name: 'Service Access',
      polyline: { points: [{ lat: 14.002, lng: 121.001 }, { lat: 14.003, lng: 121.003 }] },
      width: 4,
      surface: 'concrete',
      type: 'service',
      displayMode: 'navigation-only',
      metadata: { source: 'studio' },
    }
    const document: CampusDocument = {
      schemaVersion: 2,
      version: 7,
      metadata: { campusId, name: 'Road Round Trip', description: '', lastModified: '', editorVersion: '1.0.0' },
      buildings: [],
      roads: [visibleRoad, navigationOnlyRoad],
      panoramas: [],
      qrCheckpoints: [],
    }
    const navigationGraph = {
      version: '1.0.0',
      campusId,
      createdAt: '2026-09-25T00:00:00.000Z',
      checksum: 'roundtrip',
      nodes: [
        { id: 'node-a', label: 'Origin', type: 'outdoor', position: { lat: 14, lng: 121 }, floor: 0, buildingId: '__outdoor__', properties: {} },
        { id: 'node-b', label: 'Destination', type: 'outdoor', position: { lat: 14.001, lng: 121.002 }, floor: 0, buildingId: '__outdoor__', properties: {} },
      ],
      edges: [{ id: 'route-edge', from: 'node-a', to: 'node-b', type: 'walk', distance: 230, weight: 230 }],
      metadata: {
        nodeCount: 2, edgeCount: 1, buildings: 0, floors: 0,
        boundingBox: { minLat: 14, maxLat: 14.003, minLng: 121, maxLng: 121.003 },
      },
    }
    const compiled = buildArtifacts(
      { nodes: [], edges: [], metadata: { campusId, buildingCount: 0, floorCount: 0, generatedAt: 0 }, diagnostics: [] } as never,
      navigationGraph as never,
      document,
    )
    const publishPayload = {
      ...compiled,
      navigationGraph: compiled.graph,
      poiData: compiled.poiIndex,
      metadata: { ...compiled.metadata, sourceDocumentVersion: '7', revision: '7' },
    }
    const published = makePublishedClient()
    vi.mocked(createServerClient).mockReturnValue(published.client as never)

    const publishResponse = await POST(new NextRequest('http://localhost/api/publish', {
      method: 'POST',
      headers: { cookie: `navi-mock-session=${MOCK_SESSION}` },
      body: JSON.stringify({ artifacts: publishPayload, campusId, revision: 7 }),
    }))

    expect(publishResponse.status).toBe(200)
    expect(published.state.row?.artifacts.traces).toEqual([visibleRoad, navigationOnlyRoad])
    expect((published.state.row?.artifacts.graph as typeof navigationGraph).edges).toEqual(navigationGraph.edges)

    const campusResponse = await GET(new NextRequest(`http://localhost/api/public-campus?campus_id=${campusId}`))
    expect(campusResponse.status).toBe(200)
    const campusPayload = await campusResponse.json()
    expect(campusPayload.traces).toEqual([visibleRoad, navigationOnlyRoad])
    expect(campusPayload.edges).toEqual(navigationGraph.edges)

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(campusPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const store = createPublicStore({ cache: createMemoryCampusCacheRepository() })
    await store.getState().fetchCampusData(campusId)

    expect(fetchMock).toHaveBeenCalledWith(`/api/public-campus?campus_id=${campusId}`)
    expect(store.getState().campusStatus).toBe('ready')
    const runtimeTraces = store.getState().campus?.traces ?? []
    expect(store.getState().campus?.edges.map((edge) => edge.id)).toEqual(['route-edge'])
    expect(runtimeTraces).toHaveLength(2)
    expect(runtimeTraces[0]).toMatchObject({ id: visibleRoad.id, roadType: 'pedestrian', points: visibleRoad.polyline.points })
    expect(runtimeTraces[1]).toMatchObject({ id: navigationOnlyRoad.id, roadType: 'service', displayMode: 'navigation-only' })
  })
})
