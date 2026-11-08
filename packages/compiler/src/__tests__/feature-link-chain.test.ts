import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { CampusCompiler } from '../pipeline/campus-compiler'

const LAT = 11.8
const LNG = 122.1
const ll = (x: number, y: number) => ({ lat: LAT + y / 111320, lng: LNG + x / (111320 * Math.cos((LAT * Math.PI) / 180)) })
type Item = { id: string; level: number | number[]; links?: { below?: string; above?: string } }

/** One building, floors 1F–3F; stairs (or lifts) placed per floor. */
function campus(items: Item[], kind: 'staircases' | 'elevators' = 'staircases'): CampusDocument {
  const feature = (it: Item) => {
    const levels = Array.isArray(it.level) ? it.level : [it.level]
    return {
      id: it.id, buildingId: 'b', name: it.id, type: kind === 'staircases' ? 'standard' : 'passenger', accessible: kind === 'elevators',
      fromLevel: Math.min(...levels), toLevel: Math.max(...levels),
      levels: Object.fromEntries(levels.map((l) => [l, { position: { x: 0, y: 0 }, rotation: 0 }])),
      ...(it.links ? { links: it.links } : {}),
    }
  }
  return {
    schemaVersion: 1, version: 1, metadata: { campusId: 'c', name: 'C', description: '', lastModified: '', editorVersion: 'test' },
    roads: [], panoramas: [], qrCheckpoints: [], areas: [],
    buildings: [{
      id: 'b', name: 'B', code: 'B', category: 'academic', description: '', baseElevation: 0, height: 10,
      footprint: { points: [ll(-10, -5), ll(10, -5), ll(10, 5), ll(-10, 5)] }, verticalConnectors: [], color: '#000', aliases: [], metadata: {},
      floors: [0, 1, 2].map((level) => ({ id: `f${level}`, level, label: `${level + 1}F`, elevation: level * 3, height: 3, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {} })),
      [kind]: items.map(feature),
    }],
  } as unknown as CampusDocument
}

/** The floor pairs joined by stairs / lift edges in the compiled graph. */
function floorEdges(doc: CampusDocument, type: 'stairs' | 'elevator' = 'stairs'): string[] {
  const graph = new CampusCompiler().compileV2(doc).graph!
  const floorOf = new Map(graph.nodes.map((n) => [n.id, n.floor]))
  return graph.edges.filter((e) => e.type === type).map((e) => [floorOf.get(e.from), floorOf.get(e.to)].sort().join('–')).sort()
}

describe('linked stairs and lifts join their floors', () => {
  it('three single-floor stairs linked 1F↔2F↔3F give stairs edges 1F–2F and 2F–3F', () => {
    expect(floorEdges(campus([
      { id: 's1', level: 0, links: { above: 's2' } },
      { id: 's2', level: 1, links: { below: 's1', above: 's3' } },
      { id: 's3', level: 2, links: { below: 's2' } },
    ]))).toEqual(['0–1', '1–2'])
  })

  it('linked lifts give lift edges', () => {
    expect(floorEdges(campus([
      { id: 'l1', level: 0, links: { above: 'l2' } },
      { id: 'l2', level: 1, links: { below: 'l1' } },
    ], 'elevators'), 'elevator')).toEqual(['0–1'])
  })

  it('an unlinked single-floor stair gives no floor edge', () => {
    expect(floorEdges(campus([{ id: 's1', level: 0 }, { id: 's2', level: 1 }]))).toEqual([])
  })

  it('a link to a missing or non-adjacent stair is ignored', () => {
    expect(floorEdges(campus([
      { id: 's1', level: 0, links: { above: 'ghost' } },
      { id: 's3', level: 2, links: { below: 's1' } },
    ]))).toEqual([])
  })

  it('an old multi-level stair still pairs, also next to a linked single-floor stair', () => {
    expect(floorEdges(campus([
      { id: 'old', level: [0, 1], links: { above: 'top' } },
      { id: 'top', level: 2, links: { below: 'old' } },
    ]))).toEqual(['0–1', '1–2'])
  })
})
