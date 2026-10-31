import { describe, expect, it } from 'vitest'
import type { CampusBundle } from '@/types/nav-types'
import {
  normalizePublicCampusResult,
  normalizePublicCampusSource,
} from '../types'

const bundle = {
  nodes: [{ id: 'node-1' }],
  edges: [],
  searchEntries: [],
  buildings: [],
  poi: [],
  boundingBox: null,
} as unknown as CampusBundle

describe('Public campus transport contract', () => {
  it('normalizes published and graph-snapshot source names without changing CampusBundle', () => {
    expect(normalizePublicCampusSource('published_maps')).toBe('published')
    expect(normalizePublicCampusSource('graph_snapshots')).toBe('graph_snapshot')
    expect(normalizePublicCampusSource('empty')).toBeNull()
    expect(normalizePublicCampusSource('editor')).toBeNull()

    const result = normalizePublicCampusResult(
      { campusId: 'campus-1', source: 'published_maps', revision: 12, bundle },
      'campus-1',
    )
    expect(result).toEqual({
      campusId: 'campus-1',
      revision: '12',
      source: 'published',
      bundle,
    })
  })

  it('rejects mismatched campus IDs and unusable payloads', () => {
    expect(normalizePublicCampusResult({ campusId: 'campus-2', source: 'published_maps', bundle }, 'campus-1')).toBeNull()
    expect(normalizePublicCampusResult({ campusId: 'campus-1', source: 'empty', bundle }, 'campus-1')).toBeNull()
    expect(normalizePublicCampusResult({ campusId: 'campus-1', source: 'published_maps', bundle: { ...bundle, nodes: [] } }, 'campus-1')).toBeNull()
    expect(normalizePublicCampusResult({ campusId: 'campus-1', source: 'published_maps', bundle: { ...bundle, nodes: [null] } }, 'campus-1')).toBeNull()
  })

  it('accepts legacy bundles without terrain and rejects malformed published terrain', () => {
    const legacy = normalizePublicCampusResult(
      { campusId: 'campus-1', source: 'published', revision: '1', bundle }, 'campus-1',
    )
    expect(legacy?.bundle).toBe(bundle)

    const malformed = normalizePublicCampusResult({
      campusId: 'campus-1', source: 'published', revision: '2',
      bundle: {
        ...bundle,
        terrainAreas: [{ id: 'terrain-bad', name: 'Bad', color: '#00ff00', elevationMeters: Infinity, points: [] }],
        terrainVerticalDatum: {
          kind: 'campus-local', name: 'Test', zeroReference: '0 m', elevationStatus: 'authored-not-surveyed',
        },
      },
    }, 'campus-1')
    expect(malformed).toBeNull()
  })

  it('preserves canonical Road routing metadata by reference', () => {
    const routing = {
      sourceRoadId: 'road-1',
      authoredOrientation: 'forward' as const,
      authored: { slope: 'steep' as const, direction: 'forward' as const },
    }
    const routedBundle = {
      ...bundle,
      edges: [{ id: 'edge-1', from: 'node-1', to: 'node-2', routing }],
    } as unknown as CampusBundle
    const result = normalizePublicCampusResult(
      { campusId: 'campus-1', source: 'published_maps', revision: 12, bundle: routedBundle },
      'campus-1',
    )

    expect(result?.bundle).toBe(routedBundle)
    expect(result?.bundle.edges[0].routing).toBe(routing)
  })
})
