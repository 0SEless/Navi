import { Graph } from '@/engine/graph'
import type { GraphSnapshot } from '@/types/nav-types'

const CAMPUS_ID = 'navi-synthetic-legacy-campus'

/** Small synthetic graph-only payload; no captured or production campus data. */
export function loadLegacyFixturePayload(): GraphSnapshot {
  return {
    id: CAMPUS_ID,
    campusId: CAMPUS_ID,
    version: 1,
    updatedAt: '2026-10-10T00:00:00.000Z',
    buildings: [
      {
        id: 'synthetic-library',
        name: 'Synthetic Library',
        campusId: CAMPUS_ID,
        floors: [0],
        footprint: [],
        baseElevation: 0,
        height: 8,
      },
    ],
    nodes: [],
    edges: [],
    components: [],
    traces: [],
    areas: [],
    pois: [],
  } as unknown as GraphSnapshot
}

export function loadLegacyFixtureGraph(): Graph {
  const payload = loadLegacyFixturePayload()
  const graph = Graph.fromJSON(payload)
  graph.campusId = payload.campusId ?? payload.id
  return graph
}

export const LEGACY_FIXTURE_STATS = {
  campusId: CAMPUS_ID,
  buildings: 1,
  nodes: 0,
  edges: 0,
  traces: 0,
  outdoorPois: 0,
  floors: 1,
} as const
