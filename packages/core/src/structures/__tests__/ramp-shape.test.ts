import { describe, expect, it } from 'vitest'
import { rampHeightAt, rampShape } from '../ramp-shape'

describe('rampShape', () => {
  it('1 m over 12 m → 1:12', () => {
    expect(rampShape(1, 12, []).slopeRatio).toBeCloseTo(12, 9)
    expect(rampShape(-1, 12, []).slopeRatio).toBeCloseTo(12, 9)
    expect(rampShape(1, 12, []).runsBetweenLandingsM).toEqual([12])
  })

  it('landing at 0.5 splits the run into two equal runs minus 1.5 m', () => {
    const shape = rampShape(1, 12, [0.5])
    expect(shape.landingLengthM).toBe(1.5)
    expect(shape.runsBetweenLandingsM.map((r) => Math.round(r * 1e6) / 1e6)).toEqual([5.25, 5.25])
    expect(shape.slopeRatio).toBeCloseTo(10.5, 9)
  })

  it('zero rise → slopeRatio null', () => {
    expect(rampShape(0, 12, []).slopeRatio).toBeNull()
  })

  it('landings near an end are cut at the end; unsorted landings are sorted', () => {
    const shape = rampShape(1, 12, [0.9, 0.02])
    expect(shape.runsBetweenLandingsM.map((r) => Math.round(r * 1e6) / 1e6)).toEqual([9.06, 0.45])
  })
})

describe('rampHeightAt', () => {
  it('is level across a landing and linear between', () => {
    const at = (s: number) => rampHeightAt(10, 1, 12, [0.5], s)
    expect(at(0)).toBe(10)
    expect(at(12)).toBeCloseTo(11, 9)
    expect(at(5.25)).toBeCloseTo(10.5, 9)
    expect(at(6)).toBeCloseTo(10.5, 9)
    expect(at(6.75)).toBeCloseTo(10.5, 9)
    expect(at(2.625)).toBeCloseTo(10.25, 9)
  })
})
