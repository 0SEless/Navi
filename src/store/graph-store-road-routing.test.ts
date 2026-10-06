import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampusDocument, RoadRouting } from '@navi/core'

import { Graph } from '../engine/graph'
import { GraphAdapter } from '../../packages/editor/src/graph-adapter'
import { createDocument } from '../../packages/editor/src/context/create-editor-context'
import { useGraphStore, __resetGraphSaveQueuesForTests } from './graph-store'
import { fullSnapshotFingerprint } from '../services/full-snapshot-identity'

const ROUTING: RoadRouting = {
  feature: 'stairs',
  slope: 'steep',
  direction: 'reverse',
  startElevationMeters: 0,
  endElevationMeters: -4,
  walkable: false,
  wheelchairAccessible: false,
}

function makeDocument(): CampusDocument {
  return {
    schemaVersion: 1,
    version: 3,
    metadata: {
      campusId: 'phase-3-store',
      name: 'Phase 3 Store',
      description: '',
      lastModified: '2026-09-11T00:00:00.000Z',
      editorVersion: 'test',
    },
    buildings: [],
    roads: [{
      id: 'road-store',
      name: 'Stored stairs',
      polyline: {
        points: [
          { lat: 11.721, lng: 122.377 },
          { lat: 11.722, lng: 122.378 },
        ],
      },
      width: 3,
      surface: 'concrete',
      type: 'pedestrian',
      routing: ROUTING,
      metadata: { provenance: 'store-test' },
    }],
    panoramas: [],
    qrCheckpoints: [],
    connectivitySemanticsVersion: '1.0.0',
  }
}

describe('graph store Road routing persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    __resetGraphSaveQueuesForTests()
    useGraphStore.setState({
      graph: new Graph(),
      currentMapId: 'phase-3-store',
      syncError: null,
      syncStatus: 'idle',
    })
  })

  it('includes routing in local and mocked Supabase-bound snapshots and restores the Road', async () => {
    const graph = new Graph('phase-3-store')
    new GraphAdapter(graph).sync(makeDocument())
    useGraphStore.setState({ graph, currentMapId: 'phase-3-store' })
    let serverSnapshot: Record<string, unknown> | null = null
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>
        serverSnapshot = body
        return new Response(JSON.stringify({
          success: true,
          campusId: body.campusId,
          mutationId: body.mutationId,
          updatedAt: '2026-09-13T00:00:00.000Z',
          committedRevision: '2026-09-13T00:00:00.000Z',
          committedContentFingerprint: fullSnapshotFingerprint(body),
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({ ...serverSnapshot, updatedAt: '2026-09-13T00:00:00.000Z' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    await useGraphStore.getState().save()

    const localSnapshot = JSON.parse(localStorage.getItem('navi-graph-phase-3-store') ?? '{}')
    expect(localSnapshot.traces[0].routing).toEqual(ROUTING)

    const request = fetchMock.mock.calls[0][1] as RequestInit
    const supabaseBoundPayload = JSON.parse(request.body as string)
    expect(supabaseBoundPayload.traces[0].routing).toEqual(ROUTING)
    expect(supabaseBoundPayload.traces[0].metadata).toEqual({
      provenance: 'store-test',
      surface: 'concrete',
    })

    useGraphStore.setState({ graph: new Graph(), currentMapId: null, syncStatus: 'idle', syncError: null })
    useGraphStore.getState().loadMapData('phase-3-store')
    await vi.waitFor(() => {
      expect(createDocument(useGraphStore.getState().graph).roads[0]?.routing).toEqual(ROUTING)
    })

    const restoredRoad = createDocument(useGraphStore.getState().graph).roads[0]
    expect(restoredRoad.routing).toEqual(ROUTING)
    expect(restoredRoad.id).toBe('road-store')
    expect(restoredRoad.polyline.points).toEqual(makeDocument().roads[0].polyline.points)
  })
})
