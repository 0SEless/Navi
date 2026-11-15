import { describe, expect, it } from 'vitest'
import type { Building } from '../../types/entities'
import { BANK_REACH_M, BANK_SLOPES, WALKWAY_M, groundAroundOf } from '../ground-around'

const b = (ground?: unknown) => ({ id: 'b', ground }) as unknown as Building

describe('ground around a building', () => {
  it('old saves (any pad, or none) are Bank and plinth at Normal', () => {
    expect(groundAroundOf(b())).toEqual({ around: 'bank', slope: 0.5 })
    for (const mode of ['off', 'raise', 'lower', 'both']) {
      expect(groundAroundOf(b({ baseMode: 'fixed', pad: { mode, blendMeters: 3 } }))).toEqual({ around: 'bank', slope: 0.5 })
    }
  })

  it('reads the new setting; unknown values fall back', () => {
    expect(groundAroundOf(b({ baseMode: 'fixed', pad: { mode: 'off', blendMeters: 0 }, around: 'slopes', bankSlope: 'gentle' }))).toEqual({ around: 'slopes', slope: 1 / 3 })
    expect(groundAroundOf(b({ baseMode: 'fixed', pad: { mode: 'off', blendMeters: 0 }, around: 'leave', bankSlope: 'steep' }))).toEqual({ around: 'leave', slope: 1 })
    expect(groundAroundOf(b({ baseMode: 'fixed', pad: { mode: 'off', blendMeters: 0 }, around: 'x', bankSlope: 'y' }))).toEqual({ around: 'bank', slope: 0.5 })
  })

  it('constants from the design', () => {
    expect(BANK_SLOPES).toEqual({ gentle: 1 / 3, normal: 0.5, steep: 1 })
    expect(WALKWAY_M).toBe(1)
    expect(BANK_REACH_M).toBe(30)
  })
})
