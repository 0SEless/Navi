import { describe, it, expect } from 'vitest'
import type { NavigationGraph, NavNode, NavEdge, CompileOptions, CompileResult, CompileReport, ExtractionResult, ValidationResult, NavigationSpace, TransitionPoint, WalkableCorridor, PublishedArtifact, PublishedManifest } from '../types'

describe('types module', () => {
  it('NavigationGraph is structurally typed', () => {
    const graph: NavigationGraph = {
      version: '1.0.0',
      campusId: 'test',
      createdAt: '2026-01-01T00:00:00Z',
      checksum: 'abc',
      nodes: [],
      edges: [],
      metadata: { nodeCount: 0, edgeCount: 0, buildings: 0, floors: 0, boundingBox: { minLng: 0, maxLng: 0, minLat: 0, maxLat: 0 } },
    }
    expect(graph.version).toBe('1.0.0')
  })

  it('NavNode requires all required fields', () => {
    const node: NavNode = {
      id: 'n1',
      label: 'Room 101',
      type: 'space',
      position: { lng: 121.0, lat: 14.0 },
      floor: 1,
      buildingId: 'b1',
      properties: {},
    }
    expect(node.type).toBe('space')
  })

  it('NavEdge requires all required fields', () => {
    const edge: NavEdge = {
      id: 'e1',
      from: 'n1',
      to: 'n2',
      type: 'walk',
      distance: 10,
      weight: 10,
    }
    expect(edge.type).toBe('walk')
  })

  it('CompileOptions has defaults', () => {
    const opts: CompileOptions = {
      nodeInterval: 5,
      mergeThreshold: 1,
      optimizationLevel: 'moderate',
      includeAccessibility: false,
    }
    expect(opts.nodeInterval).toBe(5)
  })

  it('ExtractionResult aggregates primitives', () => {
    const result: ExtractionResult = {
      spaces: [],
      transitions: [],
      corridors: [],
      duration: 0,
    }
    expect(result.spaces).toEqual([])
  })

  it('ValidationResult has severity and code', () => {
    const vr: ValidationResult = {
      severity: 'error',
      code: 'EMPTY_GRAPH',
      message: 'Graph has no nodes',
    }
    expect(vr.code).toBe('EMPTY_GRAPH')
  })

  it('PublishedArtifact has filename, content, checksum, size', () => {
    const art: PublishedArtifact = {
      filename: 'graph.json',
      content: '{}',
      checksum: 'abc',
      size: 2,
    }
    expect(art.filename).toBe('graph.json')
  })

  it('PublishedManifest has all artifact refs', () => {
    const manifest: PublishedManifest = {
      projectId: 'p1',
      campusId: 'c1',
      publishedAt: '2026-01-01T00:00:00Z',
      schemaVersion: 1,
      compilerVersion: '0.1.0',
      artifacts: {
        navigationGraph: { filename: 'graph.json', checksum: 'a', size: 1 },
        searchIndex: { filename: 'search.json', checksum: 'b', size: 1 },
        poiData: { filename: 'poi.json', checksum: 'c', size: 1 },
        buildingIndex: { filename: 'building.json', checksum: 'd', size: 1 },
      },
    }
    expect(manifest.artifacts.navigationGraph.filename).toBe('graph.json')
  })
})
