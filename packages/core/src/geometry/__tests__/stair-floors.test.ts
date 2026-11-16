import { describe, expect, it } from 'vitest'
import type { Staircase, StairLevelGeometry } from '../../types/entities'
import { stairFlightFloor, stairFlightsOnFloor, stairRise, stairTopsOnFloor } from '../stair-floors'

const geom = (extra: Partial<StairLevelGeometry> = {}): StairLevelGeometry => ({ position: { x: 1, y: 2 }, rotation: 0, ...extra })
const stair = (fromLevel: number, toLevel: number, levels: Staircase['levels']): Staircase => ({
  id: 's', buildingId: 'b', name: 'Stair', type: 'open', accessible: false, fromLevel, toLevel, levels,
})
const floors = [{ level: 1, elevation: 0, height: 3.5 }, { level: 2, elevation: 3.5, height: 3.2 }]

describe('which floor draws a stair', () => {
  it('flight only on its own floor', () => {
    const s = stair(1, 2, { 1: geom(), 2: geom({ role: 'top' }) })
    expect(stairFlightsOnFloor([s], 1)).toHaveLength(1)
    expect(stairFlightsOnFloor([s], 2)).toHaveLength(0)
    expect(stairTopsOnFloor([s], 2)[0].fromLevel).toBe(1)
    expect(stairTopsOnFloor([s], 1)).toHaveLength(0)
  })

  it('legacy two-floor stair without role keeps drawing its own flight on each floor, as before', () => {
    const s = stair(1, 2, { 1: geom(), 2: geom({ position: { x: 5, y: 5 } }) })
    expect(stairFlightFloor(s)).toBe(1)
    expect(stairFlightsOnFloor([s], 1)).toHaveLength(1)
    expect(stairFlightsOnFloor([s], 2)[0].geometry.position).toEqual({ x: 5, y: 5 })
    expect(stairTopsOnFloor([s], 2)).toHaveLength(0)
  })

  it('legacy stair rise stays its own height (or the floor height) — elevations only for a stair with a top', () => {
    expect(stairRise(stair(1, 2, { 1: geom({ height: 3.2 }) }), floors)).toBe(3.2)
    expect(stairRise(stair(1, 2, { 1: geom(), 2: geom() }), floors)).toBe(3.5)
  })

  it('stair whose range reaches a floor it has no geometry on draws nothing there (ASU stair-2-9n9e shape)', () => {
    const s = stair(0, 1, { 0: geom() })
    expect(stairFlightsOnFloor([s], 0)).toHaveLength(1)
    expect(stairFlightsOnFloor([s], 1)).toHaveLength(0)
    expect(stairTopsOnFloor([s], 1)).toHaveLength(0)
  })

  it('one-floor stair unchanged', () => {
    const s = stair(1, 1, { 1: geom() })
    expect(stairFlightsOnFloor([s], 1)).toHaveLength(1)
    expect(stairFlightsOnFloor([s], 2)).toHaveLength(0)
  })
})

describe('stairRise', () => {
  it('rise follows floor elevations', () => {
    const s = stair(1, 2, { 1: geom(), 2: geom({ role: 'top' }) })
    expect(stairRise(s, floors)).toBe(3.5)
    expect(stairRise(s, [floors[0], { ...floors[1], elevation: 4 }])).toBe(4)
  })

  it('rise falls back for one-floor stair', () => {
    expect(stairRise(stair(1, 1, { 1: geom({ height: 3.2 }) }), floors)).toBe(3.2)
    expect(stairRise(stair(1, 1, { 1: geom() }), floors)).toBe(3.5)
  })
})

describe('floorStairInputs', () => {
  it('floor 1 gets the flight with the floors\' rise; floor 2 gets only the top, built from the flight', async () => {
    const { floorStairInputs } = await import('../stair-floors')
    const drawing = { definitionId: 'stair' as const, properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'ushape' } }
    const s = stair(1, 2, { 1: geom({ drawing }), 2: geom({ role: 'top', position: { x: 9, y: 9 } }) })
    const one = floorStairInputs([s], floors, 1)
    expect(one.flights).toHaveLength(1)
    expect(one.flights[0].height).toBe(3.5)
    expect(one.tops).toHaveLength(0)
    const two = floorStairInputs([s], floors, 2)
    expect(two.flights).toHaveLength(0)
    expect(two.tops).toHaveLength(1)
    expect(two.tops[0].position).toEqual({ x: 1, y: 2 })
    expect(two.tops[0].drawing).toEqual(drawing)
    expect(two.tops[0].fromLevel).toBe(1)
  })
})
