import { describe, expect, it } from 'vitest'
import { createTerrainSampler, toLatLng, type CampusDocument, type TerrainBaseSource } from '@navi/core'
import { terrainFloorStack } from '../terrain-floors'
import { buildSlabFeatures } from '../building-slabs'

// Owner 2026-11-15: the terrain editor shows the open building's floors the way NAVI Web does (one view).
const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const wall = (id: string) => ({ id, start: { x: -5, y: 0 }, end: { x: 5, y: 0 }, thickness: 0.2, height: 3.5 })
const floor = (id: string, level: number, elevation: number) => ({ id, level, label: id, elevation, height: 3.5, walls: [wall(`w-${id}`)], openings: [], windows: [], rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {} })
function plane(): TerrainBaseSource {
  const v = (x: number, y: number): [number, number, number] => { const p = ll(x, y); return [p.lat, p.lng, 10] }
  return { kind: 'mesh', vertices: [v(-200, -200), v(200, -200), v(200, 200), v(-200, 200)], triangles: [[0, 1, 2], [0, 2, 3]], sourceNote: 'test' }
}
function doc(): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: { campusId: 'c' }, roads: [], panoramas: [], qrCheckpoints: [],
    buildings: [{
      id: 'b1', name: 'Hall', footprint: { points: [ll(0, 0), ll(20, 0), ll(20, 10), ll(0, 10), ll(0, 0)] }, baseElevation: 10, height: 10.5,
      floors: [floor('f1', 0, 0), floor('f2', 1, 3.5), floor('f3', 2, 7)], verticalConnectors: [], metadata: {},
    }],
    terrain: { reference: { name: 'T', zeroMeaning: 'z' }, grid, base: plane(), colorRange: { minM: 0, maxM: 40 } },
  } as unknown as CampusDocument
}

describe('terrain editor floors (one view with NAVI Web)', () => {
  it('the open floor stands on every floor below it, each at its own height, with its walls', () => {
    const stack = terrainFloorStack(doc(), { buildingId: 'b1', floorId: 'f2' })!
    expect(stack.buildingId).toBe('b1')
    expect(stack.stackElevations).toEqual([0, 3.5])
    expect(stack.walls.features.length).toBeGreaterThan(0)
    expect(stack.stackWalls).toHaveLength(2)
  })

  it('nothing open, or an unknown building/floor: no floors', () => {
    expect(terrainFloorStack(doc(), null)).toBeUndefined()
    expect(terrainFloorStack(doc(), { buildingId: 'nope', floorId: 'f1' })).toBeUndefined()
    expect(terrainFloorStack(doc(), { buildingId: 'b1', floorId: 'nope' })).toBeUndefined()
  })

  it('the open building is drawn by its floors, so its block is left out (its plinth stays)', () => {
    const d = doc()
    const fc = buildSlabFeatures(d, createTerrainSampler(d)!, { openBuildingId: 'b1' })
    expect(fc.features.filter((f) => f.properties?.kind === 'block' || f.properties?.kind === 'cut')).toEqual([])
  })
})

it('a floor whose walls close a room gives that room as its floor slab, in map coordinates', () => {
  const d = doc()
  const square = [[-5, -5, 5, -5], [5, -5, 5, 5], [5, 5, -5, 5], [-5, 5, -5, -5]].map(([x1, y1, x2, y2], i) => ({ id: `s${i}`, start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.2, height: 3.5 }))
  ;(d.buildings[0].floors[0] as unknown as { walls: unknown[] }).walls = square
  const stack = terrainFloorStack(d, { buildingId: 'b1', floorId: 'f1' })!
  expect(stack.stackFaces[0].length).toBeGreaterThan(0)
  for (const p of stack.stackFaces[0][0]) expect(Math.abs(p.lat - 11.8)).toBeLessThan(0.01)
})
