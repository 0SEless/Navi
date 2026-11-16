import { describe, expect, it } from 'vitest'
import { buildStairAssetVolumes, buildStairTopVolumes, stairWellHoles, type StairTopInput } from '../stair-assets'

const uStair = (x = 0): StairTopInput => ({
  id: 'u', position: { x, y: 0 }, rotation: 0, height: 3.5, fromLevel: 1,
  drawing: { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'ushape', sides: 'wall' } },
})
const extent = (ring: number[][]) => {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1])
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

describe('stair tops on the upper floor', () => {
  it('a U-stair top is one stairwell with the full footprint and one top landing where the flight arrives', () => {
    const tops = buildStairTopVolumes([uStair()], 0)
    expect(tops.wells.features).toHaveLength(1)
    const well = extent(tops.wells.features[0].geometry.coordinates[0])
    expect(well.maxX - well.minX).toBeCloseTo(4.2, 6)
    expect(well.maxY - well.minY).toBeCloseTo(2.6, 6)
    expect(tops.wells.features[0].properties!.fromLevel).toBe(1)
    expect(tops.landings.features).toHaveLength(1)
    const flightTop = buildStairAssetVolumes([uStair()]).collection.features.find(f => f.properties!.partType === 'top-landing')!
    expect(extent(tops.landings.features[0].geometry.coordinates[0])).toEqual(extent(flightTop.geometry.coordinates[0]))
    // drawn on the upper floor itself: a thin walkable slab at that floor's base
    expect(tops.landings.features[0].properties!.base).toBe(0)
    expect(tops.landings.features[0].properties!.height).toBeCloseTo(0.05, 6)
  })

  it('stairwell holes: only stairs inside the building outline cut the floor above', () => {
    const outline = [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }]
    expect(stairWellHoles([uStair(0)], outline)).toHaveLength(1)
    expect(stairWellHoles([uStair(20)], outline)).toHaveLength(0)
  })
})
