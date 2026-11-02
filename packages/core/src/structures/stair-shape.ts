export const TARGET_RISER_M = 0.175
export const TARGET_TREAD_M = 0.3

export interface StairShape {
  steps: number
  /** Signed: negative when the stair goes down from its start. */
  riserM: number
  treadM: number
  flightStartM: number
  flightEndM: number
  hint: string | null
}

/**
 * Steps = max(1, round(|rise| / 0.175)) (0 when there is no rise). Without a given flight the
 * flight is centred and uses 0.30 m treads (shorter only when the run is too short, with a hint);
 * a given flight (fractions of the run) is filled by the steps.
 */
export function stairShape(riseM: number, runM: number, flight?: { startT: number; endT: number }): StairShape {
  const run = Number.isFinite(runM) && runM > 0 ? runM : 0
  const rise = Number.isFinite(riseM) ? riseM : 0
  if (rise === 0) return { steps: 0, riserM: 0, treadM: 0, flightStartM: run / 2, flightEndM: run / 2, hint: null }
  const steps = Math.max(1, Math.round(Math.abs(rise) / TARGET_RISER_M))
  const riserM = rise / steps
  if (flight) {
    const startT = Math.min(Math.max(flight.startT, 0), 1)
    const endT = Math.min(Math.max(flight.endT, startT), 1)
    const flightStartM = startT * run
    const flightEndM = endT * run
    return { steps, riserM, treadM: (flightEndM - flightStartM) / steps, flightStartM, flightEndM, hint: null }
  }
  const needed = steps * TARGET_TREAD_M
  const treadM = Math.min(TARGET_TREAD_M, run / steps)
  const flightLength = treadM * steps
  const flightStartM = (run - flightLength) / 2
  const hint = run < needed - 1e-9 ? `needs ${needed.toFixed(1)} m, drawn ${run.toFixed(1)} m` : null
  return { steps, riserM, treadM, flightStartM, flightEndM: flightStartM + flightLength, hint }
}
