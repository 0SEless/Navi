// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }))

import { createServerClient } from '@supabase/ssr'
import { GET } from '../route'

function mockPublished(artifacts: Record<string, unknown>) {
  const client = {
    from: vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => table === 'published_maps'
            ? { data: { artifacts }, error: null }
            : { data: null, error: null },
        }),
      }),
    })),
  }
  ;(createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)
  return client
}

function request() {
  return new NextRequest('http://localhost/api/public-campus?campus_id=phase7b-campus')
}

describe('GET /api/public-campus — Phase 7B contract', () => {
  it('carries an explicit published campus display name without changing campus identity', async () => {
    mockPublished({
      graph: { nodes: [], edges: [] },
      buildingIndex: { buildings: [] },
      metadata: {
        campusId: 'phase7b-campus',
        campusName: 'North Campus',
      },
    })

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.campusId).toBe('phase7b-campus')
    expect(body.campusName).toBe('North Campus')
  })

  it('returns published components and doors with the requested campus identity', async () => {
    mockPublished({
      graph: { nodes: [], edges: [] },
      buildingIndex: { buildings: [] },
      components: [{ id: 'room-public', type: 'room' }],
      doors: [{ id: 'door-public', roomId: 'room-public' }],
      metadata: { campusId: 'phase7b-campus', revision: '7', compiledAt: '2026-09-06T00:00:00.000Z' },
    })

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.campusId).toBe('phase7b-campus')
    expect(body.components).toEqual([{ id: 'room-public', type: 'room' }])
    expect(body.doors).toEqual([{ id: 'door-public', roomId: 'room-public' }])
  })

  it('keeps old published artifacts readable with additive empty geometry defaults', async () => {
    mockPublished({
      graph: { nodes: [], edges: [] },
      buildingIndex: { buildings: [] },
    })

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.campusId).toBe('phase7b-campus')
    expect(body.components).toEqual([])
    expect(body.doors).toEqual([])
  })

  it('returns validated additive terrain from a newly published artifact', async () => {
    const terrain = {
      terrainAreas: [{
        id: 'terrain-1', name: 'North lawn', color: '#22aa66', elevationMeters: 3.25,
        points: [{ lat: 14, lng: 121 }, { lat: 14.001, lng: 121 }, { lat: 14.001, lng: 121.001 }],
      }],
      terrainVerticalDatum: {
        kind: 'campus-local', name: 'Synthetic datum', zeroReference: 'Synthetic point at zero',
        elevationStatus: 'authored-not-surveyed',
      },
    }
    mockPublished({
      graph: { nodes: [], edges: [] },
      buildingIndex: { buildings: [] },
      ...terrain,
    })

    const response = await GET(request())
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.artifacts).toMatchObject(terrain)
  })

  it('rejects corrupt terrain instead of serving it as published data', async () => {
    mockPublished({
      graph: { nodes: [], edges: [] },
      buildingIndex: { buildings: [] },
      terrainAreas: [{ id: 'bad', name: 'Bad', color: '#22aa66', elevationMeters: Number.NaN, points: [] }],
      terrainVerticalDatum: {
        kind: 'campus-local', name: 'Synthetic datum', zeroReference: 'Synthetic point at zero',
        elevationStatus: 'authored-not-surveyed',
      },
    })

    const response = await GET(request())
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ error: 'PUBLIC_CAMPUS_ARTIFACT_INVALID' })
  })
})
