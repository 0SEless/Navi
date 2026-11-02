import { describe, expect, it } from 'vitest'
import { stairShape } from '../stair-shape'
import { structurePath } from '../path'

describe('stairShape', () => {
  it('3.5 m rise over 6 m → 20 steps, riser 0.175, tread 0.30, flight centred', () => {
    const s = stairShape(3.5, 6)
    expect(s.steps).toBe(20)
    expect(s.riserM).toBeCloseTo(0.175, 6)
    expect(s.treadM).toBeCloseTo(0.3, 6)
    expect(s.flightStartM).toBeCloseTo(0, 6)
    expect(s.flightEndM).toBeCloseTo(6, 6)
    expect(s.hint).toBeNull()
    const long = stairShape(-3.5, 10)
    expect(long.flightStartM).toBeCloseTo(2, 6)
    expect(long.flightEndM).toBeCloseTo(8, 6)
    expect(long.riserM).toBeCloseTo(-0.175, 6)
  })

  it('stairShape handles zero rise and short runs', () => {
    expect(stairShape(0, 5)).toMatchObject({ steps: 0, riserM: 0, hint: null })
    expect(stairShape(0.05, 3).steps).toBe(1)
    const short = stairShape(3.5, 2)
    expect(short.steps).toBe(20)
    expect(short.treadM).toBeCloseTo(0.1, 6)
    expect(short.hint).toBe('needs 6.0 m, drawn 2.0 m')
    const none = stairShape(3, 0)
    for (const value of Object.values(none)) if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true)
  })

  it('a given flight is used as fractions of the run', () => {
    const s = stairShape(3.5, 20, { startT: 0.1, endT: 0.9 })
    expect(s.flightStartM).toBeCloseTo(2, 6)
    expect(s.flightEndM).toBeCloseTo(18, 6)
    expect(s.treadM).toBeCloseTo(0.8, 6) // the user's flight run is filled by the steps
  })
})

describe('structurePath', () => {
  it('straight path length equals distance', () => {
    const path = structurePath({ x: 0, y: 0 }, { x: 30, y: 40 })
    expect(path.length).toBeCloseTo(50, 6)
    expect(path.at(25).p.x).toBeCloseTo(15, 3)
    expect(path.at(25).n.x).toBeCloseTo(-0.8, 3)
  })

  it('bend keeps endpoints fixed', () => {
    const path = structurePath({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 10 })
    expect(path.at(0).p).toEqual({ x: 0, y: 0 })
    const end = path.at(path.length).p
    expect(end.x).toBeCloseTo(20, 6)
    expect(end.y).toBeCloseTo(0, 6)
    expect(path.length).toBeGreaterThan(20)
  })
})
