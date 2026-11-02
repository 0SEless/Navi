export const RAMP_LANDING_M = 1.5

export interface RampShape {
  /** N in 1:N over the sloped parts; null when the ramp is level. */
  slopeRatio: number | null
  /** Lengths of the sloped runs between the landings (and the ends). */
  runsBetweenLandingsM: number[]
  landingLengthM: typeof RAMP_LANDING_M
}

/** Landing intervals along the run: 1.5 m centred at each fraction, cut at the ends, sorted. */
function landingIntervals(runM: number, landings: number[]): Array<[number, number]> {
  return [...landings]
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)
    .map((t): [number, number] => {
      const centre = Math.min(Math.max(t, 0), 1) * runM
      return [Math.max(0, centre - RAMP_LANDING_M / 2), Math.min(runM, centre + RAMP_LANDING_M / 2)]
    })
}

function slopedRuns(runM: number, landings: number[]): number[] {
  const runs: number[] = []
  let at = 0
  for (const [a, b] of landingIntervals(runM, landings)) {
    if (a > at) runs.push(a - at)
    at = Math.max(at, b)
  }
  if (runM > at) runs.push(runM - at)
  return runs
}

/**
 * A ramp: level 1.5 m landings centred at the given fractions of the run, straight slopes between.
 * No pass/fail mark yet: the BP 344 limit (1:12 or 1:20) is waiting for the owner.
 */
export function rampShape(riseM: number, runM: number, landings: number[]): RampShape {
  const run = Number.isFinite(runM) && runM > 0 ? runM : 0
  const runs = slopedRuns(run, landings)
  const sloped = runs.reduce((sum, r) => sum + r, 0)
  const rise = Number.isFinite(riseM) ? Math.abs(riseM) : 0
  return { slopeRatio: rise < 1e-9 || sloped < 1e-9 ? null : sloped / rise, runsBetweenLandingsM: runs, landingLengthM: RAMP_LANDING_M }
}

/** Top height at arc length s: the rise is spread over the sloped parts only. */
export function rampHeightAt(startH: number, riseM: number, runM: number, landings: number[], s: number): number {
  const run = Number.isFinite(runM) && runM > 0 ? runM : 0
  const at = Math.min(Math.max(s, 0), run)
  const intervals = landingIntervals(run, landings)
  const flatBefore = (x: number) => {
    let flat = 0
    let covered = 0
    for (const [a, b] of intervals) {
      const lo = Math.max(a, covered)
      const hi = Math.min(b, x)
      if (hi > lo) flat += hi - lo
      covered = Math.max(covered, b)
    }
    return flat
  }
  const sloped = run - flatBefore(run)
  if (sloped < 1e-9) return startH
  return startH + (riseM * (at - flatBefore(at))) / sloped
}
