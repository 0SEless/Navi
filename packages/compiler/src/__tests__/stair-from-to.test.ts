import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { CampusCompiler } from '../pipeline/campus-compiler'

const LAT = 11.8
const LNG = 122.1
const ll = (x: number, y: number) => ({ lat: LAT + y / 111320, lng: LNG + x / (111320 * Math.cos((LAT * Math.PI) / 180)) })
const drawing = { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'ushape', sides: 'wall', turn: 'left', topLandingM: 2 } }

/** One building, floors 1F–3F (elevations 0, 3.5, 7), one From/To stair 1F → 2F. */
function campus(): CampusDocument {
  return {
    schemaVersion: 1, version: 1, metadata: { campusId: 'c', name: 'C', description: '', lastModified: '', editorVersion: 'test' },
    roads: [], panoramas: [], qrCheckpoints: [], areas: [],
    buildings: [{
      id: 'b', name: 'B', code: 'B', category: 'academic', description: '', baseElevation: 0, height: 10.5,
      footprint: { points: [ll(-10, -5), ll(10, -5), ll(10, 5), ll(-10, 5)] }, verticalConnectors: [], color: '#000', aliases: [], metadata: {},
      floors: [0, 1, 2].map((level) => ({ id: `f${level}`, level, label: `${level + 1}F`, elevation: level * 3.5, height: 3.5, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {} })),
      staircases: [{ id: 's', buildingId: 'b', name: 'Stair', type: 'standard', accessible: false, fromLevel: 0, toLevel: 1,
        levels: { 0: { position: { x: 1, y: 2 }, rotation: 0, drawing }, 1: { role: 'top', position: { x: 3, y: 2 }, rotation: 0 } } }],
    }],
  } as unknown as CampusDocument
}

describe('a stair from one floor to the next', () => {
  const result = new CampusCompiler().compileV2(campus())

  it('gives exactly one stairs edge between the two floors', () => {
    const graph = result.graph!
    const floorOf = new Map(graph.nodes.map((n) => [n.id, n.floor]))
    expect(graph.edges.filter((e) => e.type === 'stairs').map((e) => [floorOf.get(e.from), floorOf.get(e.to)].sort().join('–'))).toEqual(['0–1'])
  })

  it('publishes the flight on 1F and only its top on 2F (built from the flight), with the floors\' rise', () => {
    const floors = result.artifacts!.floorGeometry!.buildings[0]!.floors
    const one = floors.find((f) => f.level === 0)!.staircases
    const two = floors.find((f) => f.level === 1)!.staircases
    expect(one).toHaveLength(1)
    expect(one[0].role).toBeUndefined()
    expect(one[0].height).toBe(3.5)
    expect(one[0].drawing).toEqual(drawing)
    expect(two).toHaveLength(1)
    expect(two[0].role).toBe('top')
    expect(two[0].fromLevel).toBe(0)
    expect(two[0].position).toEqual({ x: 1, y: 2 })
    expect(two[0].drawing).toEqual(drawing)
    expect(floors.find((f) => f.level === 2)!.staircases).toHaveLength(0)
  })

  it('the published stair list marks the upper floor entry as a top', () => {
    const comps = (result.artifacts as unknown as { components: Array<{ id: string; type: string; floor: number; metadata?: Record<string, unknown>; polygon?: unknown }> }).components.filter((c) => c.type === 'stair')
    expect(comps.find((c) => c.floor === 0)?.metadata?.role).toBeUndefined()
    const top = comps.find((c) => c.floor === 1)
    expect(top?.metadata?.role).toBe('top')
    expect(top?.polygon).toBeUndefined()
  })
})

describe('older multi-floor stairs publish exactly as before', () => {
  it('a stair with its own geometry on 1F and 2F (no top) publishes both flights, each with its own position and the floor height', () => {
    const doc = campus()
    const st = doc.buildings[0].staircases![0] as unknown as { levels: Record<number, Record<string, unknown>> }
    st.levels[1] = { position: { x: 7, y: 7 }, rotation: 0 }
    const floors = new CampusCompiler().compileV2(doc).artifacts!.floorGeometry!.buildings[0]!.floors
    const two = floors.find((f) => f.level === 1)!.staircases
    expect(two[0].role).toBeUndefined()
    expect(two[0].position).toEqual({ x: 7, y: 7 })
    expect(two[0].height).toBe(3.5)
    const one = floors.find((f) => f.level === 0)!.staircases
    expect(one[0].height).toBe(3.5)
  })

  it('a stair that names a floor above but has no top keeps its own rise', () => {
    const doc = campus()
    const st = doc.buildings[0].staircases![0] as unknown as { toLevel: number; levels: Record<number, Record<string, unknown>> }
    delete st.levels[1]
    st.toLevel = 2
    st.levels[0].height = 3.2
    const one = new CampusCompiler().compileV2(doc).artifacts!.floorGeometry!.buildings[0]!.floors.find((f) => f.level === 0)!.staircases
    expect(one[0].height).toBe(3.2)
  })
})


describe('outside stair doorway is published (2026-11-17)', () => {
  it('the flight entry carries where its doorway is, so NAVI Web leaves that side of the platform open', () => {
    const doc = campus()
    const f2 = doc.buildings[0].floors[1] as unknown as Record<string, unknown>
    f2.walls = [{ id: 'n', start: { x: -10, y: 5 }, end: { x: 10, y: 5 }, height: 3.5, thickness: 0.2 }]
    f2.openings = [{ id: 's-top-opening', type: 'door', wallId: 'n', offset: 6, width: 2, height: 2.1, sillHeight: 0, doorAppearance: 'open', metadata: { stairId: 's' } }]
    const one = new CampusCompiler().compileV2(doc).artifacts!.floorGeometry!.buildings[0]!.floors.find((f) => f.level === 0)!.staircases
    expect(one[0].doorwayAt).toEqual({ x: -3, y: 5 })
  })
})
