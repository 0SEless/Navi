import { describe, expect, it } from 'vitest'
import { stairWellsFromBelow } from '../floor-architecture-assets'

// Owner 2026-11-18: white floor pieces over the Computer Science stair. Its stairs are Stair-tool stairs (no To
// floor, so no stair top), and the floor above them was never opened. Every stair climbing up through a floor opens it.

const outline = (y0: number, y1: number) => ({ points: [{ x: 0, y: y0 }, { x: 2, y: y0 }, { x: 2, y: y1 }, { x: 0, y: y1 }] })
const floors = [
  { level: 0, elevation: 0, height: 3.5, staircases: [{ id: 'gf', polygon: outline(0, 10) }] },
  { level: 1, elevation: 3.5, height: 3.5, staircases: [{ id: 'up', polygon: outline(10, 15) }, { id: 'designed', polygon: outline(20, 25), height: 3.5 }] },
  { level: 2, elevation: 7, height: 3.5, staircases: [{ id: 'designed', role: 'top', polygon: outline(20, 25) }] },
]

describe('stairWellsFromBelow', () => {
  it('opens a floor over each stair that climbs up to it from the floor below', () => {
    expect(stairWellsFromBelow(floors, 1)).toEqual([outline(0, 10).points])
    // The designed stair already has its own stairwell (its top on 2F): not opened twice.
    expect(stairWellsFromBelow(floors, 2)).toEqual([outline(10, 15).points])
  })

  it('the ground floor and an unknown floor have none', () => {
    expect(stairWellsFromBelow(floors, 0)).toEqual([])
    expect(stairWellsFromBelow(floors, 9)).toEqual([])
  })

  it('a stair that stops short of the floor does not open it', () => {
    const short = [{ level: 0, elevation: 0, height: 3.5, staircases: [{ id: 's', polygon: outline(0, 3), height: 1 }] }, { level: 1, elevation: 3.5, height: 3.5, staircases: [] }]
    expect(stairWellsFromBelow(short, 1)).toEqual([])
  })
})
