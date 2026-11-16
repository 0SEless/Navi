import { describe, expect, it } from 'vitest'
import { CoordinateTransformer, type Building } from '@navi/core'
import { wholeBuildingPieces } from '../whole-building'

const transformer = new CoordinateTransformer()
transformer.registerBuilding({ buildingId: 'b', origin: { lat: 12, lng: 122 }, rotation: 0 })
const box = (id: string) => [
  { id: `${id}-s`, start: { x: -10, y: -10 }, end: { x: 10, y: -10 }, height: 3.5, thickness: 0.2 },
  { id: `${id}-e`, start: { x: 10, y: -10 }, end: { x: 10, y: 10 }, height: 3.5, thickness: 0.2 },
  { id: `${id}-n`, start: { x: 10, y: 10 }, end: { x: -10, y: 10 }, height: 3.5, thickness: 0.2 },
  { id: `${id}-w`, start: { x: -10, y: 10 }, end: { x: -10, y: -10 }, height: 3.5, thickness: 0.2 },
]
const drawing = { definitionId: 'stair' as const, properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'ushape' } }
function building(): Building {
  return {
    id: 'b', name: 'B',
    floors: [0, 1, 2].map((level) => ({ id: `f${level}`, level, label: `Floor ${level + 1}`, elevation: level * 3.5, height: 3.5, walls: box(`w${level}`), openings: [], doors: [], windows: [], rooms: [] })),
    staircases: [{ id: 's', buildingId: 'b', name: 'S', type: 'standard', accessible: false, fromLevel: 0, toLevel: 1,
      levels: { 0: { position: { x: 0, y: 0 }, rotation: 0, drawing }, 1: { role: 'top', position: { x: 0, y: 0 }, rotation: 0 } } }],
  } as unknown as Building
}

describe('whole-building view pieces', () => {
  it('editing Floor 1: Floors 2 and 3 stand faded above at their heights; Floor 1 itself is not repeated', () => {
    const pieces = wholeBuildingPieces(building(), 0, new Set(), transformer)
    const bases = pieces.walls.features.map((f) => f.properties!.base as number)
    expect(Math.min(...bases)).toBeCloseTo(3.5)
    expect(Math.max(...bases)).toBeCloseTo(7)
    expect(pieces.walls.features.every((f) => f.properties!.floorLevel !== 0)).toBe(true)
  })

  it('hidden floors are left out', () => {
    const pieces = wholeBuildingPieces(building(), 0, new Set([2]), transformer)
    expect(pieces.walls.features.every((f) => f.properties!.floorLevel === 1)).toBe(true)
  })

  it('editing Floor 2: floors below are not drawn, the floor above is, at its height above Floor 2', () => {
    const pieces = wholeBuildingPieces(building(), 1, new Set(), transformer)
    expect(pieces.walls.features.every((f) => f.properties!.floorLevel === 2)).toBe(true)
    expect(Math.min(...pieces.walls.features.map((f) => f.properties!.base as number))).toBeCloseTo(3.5)
  })

  it('Floor 2 has a floor slab with a hole over the inside stair from Floor 1, and shows the stair top', () => {
    const pieces = wholeBuildingPieces(building(), 0, new Set([2]), transformer)
    const slabs = pieces.floors.features.filter((f) => f.properties!.floorLevel === 1)
    expect(slabs.length).toBeGreaterThan(0)
    expect(slabs.some((f) => f.geometry.coordinates.length === 2)).toBe(true)
    expect(pieces.stairs.features.filter((f) => f.properties!.partType === 'top-landing')).toHaveLength(1)
    expect(pieces.stairs.features.filter((f) => f.properties!.partType === 'step')).toHaveLength(0)
  })

  it("a stair whose top reaches nothing on the floor above is marked red there; one that lands is not", () => {
    const b = building()
    const far = wholeBuildingPieces(b, 0, new Set(), transformer)
    // the box walls enclose the stair, so its top lands inside Floor 2's space
    expect(far.warnings.features).toHaveLength(0)
    const outside = building()
    outside.staircases![0].levels[0].position = { x: 40, y: 0 }
    const pieces = wholeBuildingPieces(outside, 0, new Set(), transformer)
    expect(pieces.warnings.features).toHaveLength(1)
    expect(pieces.warnings.features[0].properties!.base).toBeCloseTo(3.5)
  })
})
