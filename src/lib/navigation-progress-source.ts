export const GPS_GOOD_ACCURACY_M = 15
export const GPS_DROP_GRACE_MS = 5_000
export const DEVIATION_THRESHOLD_M = 30

export type ProgressMode = 'gps' | 'step'

export interface GpsFix {
  accuracy: number | null
  timestamp: number
}

export function isGoodFix(fix: GpsFix | null): boolean {
  return fix !== null && Number.isFinite(fix.accuracy) && fix.accuracy! <= GPS_GOOD_ACCURACY_M
}

export function nextProgressMode(input: {
  previous: ProgressMode
  fix: GpsFix | null
  now: number
  lastGoodFixAt: number | null
  indoors: boolean
}): ProgressMode {
  if (input.indoors) return 'step'
  if (
    isGoodFix(input.fix)
    && input.fix !== null
    && input.now - input.fix.timestamp >= 0
    && input.now - input.fix.timestamp <= GPS_DROP_GRACE_MS
  ) return 'gps'
  if (
    input.previous === 'gps'
    && input.lastGoodFixAt !== null
    && input.now - input.lastGoodFixAt <= GPS_DROP_GRACE_MS
  ) return 'gps'
  return 'step'
}

export function progressModeLabel(mode: ProgressMode): 'Following GPS' | 'Tap Next at each step' {
  return mode === 'gps' ? 'Following GPS' : 'Tap Next at each step'
}

export function shouldWarnOffRoute(input: {
  mode: ProgressMode
  accuracy: number | null
  distanceFromRouteM: number
}): boolean {
  return input.mode === 'gps'
    && input.accuracy !== null
    && input.accuracy <= GPS_GOOD_ACCURACY_M
    && input.distanceFromRouteM > DEVIATION_THRESHOLD_M
}
