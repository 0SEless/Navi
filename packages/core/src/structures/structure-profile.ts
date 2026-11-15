import type { Structure, StructureForm } from './types'
import { RAMP_LANDING_M } from './ramp-shape'

/**
 * Stairs and ramps with landings, steepness and landing heights (owner 2026-11-15: "stair, then a flat area,
 * then stair, continuous … adjust its steepness … raised manually").
 *
 * The path is split by flat landings (centred at fractions of the run, `landingLengthM` long). Each stretch
 * between landings is one flight (stairs) or slope (ramps) that takes only the length the steepness needs; the
 * rest of that stretch is level at its top end (a level approach to the landing above). Landing heights are
 * automatic (the rise shared by stretch length) unless typed; a typed height is kept and the neighbours take the
 * difference. Old structures without any of these settings keep their original shape (see usesProfile).
 */
export type Steepness = 'gentle' | 'normal' | 'steep'

export const STEEPNESS: Record<Steepness, { riserM: number; treadM: number; rampSlope: number }> = {
  gentle: { riserM: 0.15, treadM: 0.33, rampSlope: 1 / 12 },
  normal: { riserM: 0.175, treadM: 0.3, rampSlope: 1 / 8 },
  steep: { riserM: 0.19, treadM: 0.26, rampSlope: 1 / 5 },
}
export const STAIR_LANDING_M = 1.2

export interface ProfileOptions {
  landings?: number[]
  landingLengthM?: number
  landingHeightsM?: Array<number | null>
  steepness?: Steepness
}

export interface ProfileFlight {
  /** Where the stretch's stepped (or sloped) part starts and ends along the path. */
  startM: number
  endM: number
  fromH: number
  toH: number
  /** Stairs only; 0 for a level stretch and for ramps. */
  steps: number
  riserM: number
  treadM: number
}

export interface StructureProfile {
  flights: ProfileFlight[]
  landings: Array<{ startM: number; endM: number; h: number }>
  heightAt(s: number): number
  /** Every place the shape changes (tread edges, landing edges), for building the 3D shape. */
  marks: number[]
  hint: string | null
}

/** True when a structure uses any of the 2026-11-15 settings (stair landings, steepness, landing size/heights). */
export function usesProfile(structure: Pick<Structure, 'form' | 'landings'> & ProfileOptions): boolean {
  return (structure.form === 'stairs' && (structure.landings?.length ?? 0) > 0)
    || structure.steepness !== undefined || structure.landingLengthM !== undefined || structure.landingHeightsM !== undefined
}

export function isSteepness(value: unknown): value is Steepness {
  return typeof value === 'string' && value in STEEPNESS
}

export function structureProfile(form: StructureForm, startH: number, riseM: number, runM: number, opts: ProfileOptions): StructureProfile {
  const run = Number.isFinite(runM) && runM > 0 ? runM : 0
  const rise = Number.isFinite(riseM) ? riseM : 0
  const endH = startH + rise
  const spec = STEEPNESS[opts.steepness ?? 'normal']
  const length = Math.max(0, opts.landingLengthM ?? (form === 'stairs' ? STAIR_LANDING_M : RAMP_LANDING_M))

  // Landings: [a, b] along the path, sorted, overlapping ones merged; typed heights follow their landing.
  const raw = (opts.landings ?? [])
    .map((t, i) => ({ t, typed: opts.landingHeightsM?.[i] }))
    .filter((l) => Number.isFinite(l.t))
    .sort((a, b) => a.t - b.t)
  const landings: Array<{ startM: number; endM: number; typed: number | null | undefined; h: number }> = []
  for (const l of raw) {
    const centre = Math.min(Math.max(l.t, 0), 1) * run
    const a = Math.max(0, centre - length / 2)
    const b = Math.min(run, centre + length / 2)
    const last = landings[landings.length - 1]
    if (last && a <= last.endM) { last.endM = Math.max(last.endM, b); continue }
    landings.push({ startM: a, endM: b, typed: Number.isFinite(l.typed) ? l.typed : null, h: 0 })
  }

  // Stretches between landings (and the ends).
  const stretches: Array<[number, number]> = []
  let at = 0
  for (const l of landings) { stretches.push([at, l.startM]); at = l.endM }
  stretches.push([at, run])

  // Landing heights: typed ones are anchors; automatic ones share the rise between anchors by stretch length.
  const anchors: Array<{ index: number; h: number }> = [{ index: -1, h: startH }]
  landings.forEach((l, i) => { if (l.typed !== null && l.typed !== undefined) anchors.push({ index: i, h: l.typed }) })
  anchors.push({ index: landings.length, h: endH })
  for (let k = 1; k < anchors.length; k++) {
    const from = anchors[k - 1]
    const to = anchors[k]
    // Stretch lengths between the two anchors: stretch j sits before landing j.
    const lens: number[] = []
    for (let j = from.index + 1; j <= to.index; j++) lens.push(Math.max(0, stretches[j][1] - stretches[j][0]))
    const total = lens.reduce((s, x) => s + x, 0)
    let acc = 0
    for (let i = from.index + 1; i < to.index; i++) {
      acc += lens[i - from.index - 1]
      const frac = total > 1e-9 ? acc / total : (i - from.index) / (to.index - from.index)
      landings[i].h = from.h + (to.h - from.h) * frac
    }
    if (to.index < landings.length) landings[to.index].h = to.h
  }

  const hints: string[] = []
  const flights: ProfileFlight[] = stretches.map(([a, b], j) => {
    const fromH = j === 0 ? startH : landings[j - 1].h
    const toH = j === stretches.length - 1 ? endH : landings[j].h
    const dh = toH - fromH
    const gap = Math.max(0, b - a)
    if (Math.abs(dh) < 1e-9) return { startM: a, endM: a, fromH, toH, steps: 0, riserM: 0, treadM: 0 }
    let need: number
    let steps = 0
    let riserM = 0
    if (form === 'stairs') {
      steps = Math.max(1, Math.round(Math.abs(dh) / spec.riserM))
      riserM = dh / steps
      need = steps * spec.treadM
    } else {
      need = Math.abs(dh) / spec.rampSlope
    }
    if (need > gap + 1e-9) hints.push(`needs ${need.toFixed(1)} m, drawn ${gap.toFixed(1)} m`)
    const used = Math.min(need, gap)
    // Level at the top end: going up the flight starts at the stretch start; going down it ends at the stretch end.
    const startM = dh > 0 ? a : b - used
    return { startM, endM: startM + used, fromH, toH, steps, riserM, treadM: steps > 0 ? used / steps : 0 }
  })

  const heightAt = (s: number): number => {
    const x = Math.min(Math.max(s, 0), run)
    for (const l of landings) if (x >= l.startM && x <= l.endM) return l.h
    for (let j = 0; j < stretches.length; j++) {
      const [a, b] = stretches[j]
      if (x < a - 1e-9 || x > b + 1e-9) continue
      const f = flights[j]
      if (x <= f.startM + 1e-9) return f.fromH
      if (x >= f.endM - 1e-9) return f.toH
      if (form === 'stairs' && f.steps > 0) return f.fromH + f.riserM * Math.min(f.steps, Math.floor((x - f.startM) / (f.treadM || 1)) + 1)
      return f.fromH + ((f.toH - f.fromH) * (x - f.startM)) / (f.endM - f.startM || 1)
    }
    return endH
  }

  const marks = new Set<number>([0, run])
  for (const l of landings) { marks.add(l.startM); marks.add(l.endM) }
  for (const f of flights) {
    marks.add(f.startM); marks.add(f.endM)
    for (let k = 1; k < f.steps; k++) marks.add(f.startM + k * f.treadM)
  }
  return {
    flights,
    landings: landings.map(({ startM, endM, h }) => ({ startM, endM, h })),
    heightAt,
    marks: [...marks].map((m) => Math.round(m * 1e6) / 1e6).sort((p, q) => p - q),
    hint: hints.length ? hints[0] : null,
  }
}
