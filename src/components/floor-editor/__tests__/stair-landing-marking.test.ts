import { describe, expect, it } from 'vitest'
import type { Building } from '@navi/core'
import { stairLandingMarkings } from '../stair-landing-marking'

// A Stair-tool stair 2 m wide climbing north (+y) from Floor 2 to Floor 3; its top landing is x 0..2, y 3..4 (local m).
function building(toLevel: number, extra: Record<string, unknown> = {}): Building {
  return {
    id: 'b', name: 'B',
    floors: [
      { id: 'f1', level: 1, label: 'Floor 2', elevation: 3.5, height: 3.5 },
      { id: 'f2', level: 2, label: 'Floor 3', elevation: 7, height: 3.5 },
    ],
    staircases: [{ id: 's', buildingId: 'b', name: 'Stair', type: 'open', accessible: false, fromLevel: 1, toLevel,
      levels: {
        1: { position: { x: 1, y: 0 }, rotation: 0, polygon: { points: [{ x: 0, y: -4 }, { x: 2, y: -4 }, { x: 2, y: 4 }, { x: 0, y: 4 }] } },
        ...(toLevel > 1 ? { 2: { role: 'top', position: { x: 1, y: 4 }, rotation: 0, ...extra } } : {}),
      } }],
  } as unknown as Building
}
const round = (points: Array<{ x: number; y: number }>) => points.map(({ x, y }) => [+x.toFixed(2), +y.toFixed(2)])

describe('stair landing marking on the flight floor (owner 2026-11-19)', () => {
  it('draws the top landing on the floor the stair starts from, named after the floor it lands on', () => {
    const [marking] = stairLandingMarkings(building(2), 1)
    expect(marking.label).toBe('Lands on Floor 3')
    expect(round(marking.ring)).toEqual([[0, 3], [2, 3], [2, 4], [0, 4]])
    expect(marking.exitEdge).toBeUndefined()
  })

  it('marks the exit edge once an exit is set', () => {
    const [marking] = stairLandingMarkings(building(2, { landingExit: 'front' }), 1)
    expect(round(marking.exitEdge!)).toEqual([[2, 4], [0, 4]])
  })

  it('draws nothing on the floor it lands on, nor for a one-floor stair', () => {
    expect(stairLandingMarkings(building(2), 2)).toEqual([])
    expect(stairLandingMarkings(building(1), 1)).toEqual([])
  })
})
