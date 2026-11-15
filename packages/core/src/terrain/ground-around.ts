import type { Building } from '../types/entities'

/**
 * How the hill meets a building (owner 2026-11-15, "banks and plinths"): uphill the ground is cut back as a
 * sloped bank after a 1 m level walkway; downhill the ground is left alone and the building shows a plinth.
 * "Slopes all round" also fills downhill; "Leave the hill" only digs/fills the outline itself.
 * Every older saved pad value reads as Bank and plinth (the editor set "Raise and lower" without asking).
 */
export type GroundAround = 'bank' | 'slopes' | 'leave'
export type BankSlope = 'gentle' | 'normal' | 'steep'

export const BANK_SLOPES: Record<BankSlope, number> = { gentle: 1 / 3, normal: 0.5, steep: 1 }
export const WALKWAY_M = 1
export const BANK_REACH_M = 30

const AROUND: GroundAround[] = ['bank', 'slopes', 'leave']

export function isGroundAround(value: unknown): value is GroundAround {
  return AROUND.includes(value as GroundAround)
}
export function isBankSlope(value: unknown): value is BankSlope {
  return typeof value === 'string' && value in BANK_SLOPES
}

export function groundAroundOf(building: Building): { around: GroundAround; slope: number } {
  const g = building.ground
  return {
    around: isGroundAround(g?.around) ? g.around : 'bank',
    slope: BANK_SLOPES[isBankSlope(g?.bankSlope) ? g.bankSlope : 'normal'],
  }
}
