import {
  BUILT_IN_PRESETS, RAMP_LANDING_M, rampShape, resolveStructureEnds, stairShape, structurePath, toLatLng, toLocal,
  type CampusDocument, type ResolvedStructure, type Structure, type StructureEnd, type TerrainGrid, type TerrainSampler,
} from '@navi/core'

type LatLng = { lat: number; lng: number }

export const NEW_STAIR_LENGTH_M = 3

/** A new stair: a 3 m block on the ground, pointing east, with the plain-stair preset. */
export function newStair(id: string, grid: TerrainGrid, at: LatLng): Structure {
  const preset = BUILT_IN_PRESETS[0]
  const q = toLocal(grid, at)
  return {
    id, form: preset.form, presetId: preset.id, ...preset.shape,
    start: { kind: 'ground', position: { lat: at.lat, lng: at.lng } },
    end: { kind: 'ground', position: toLatLng(grid, { x: q.x + NEW_STAIR_LENGTH_M, y: q.y }) },
  }
}

/** The stair under a map point (within its width plus 0.5 m), if any. */
export function structureAt(document: CampusDocument, sampler: TerrainSampler, at: LatLng): string | null {
  const q = toLocal(sampler.grid, at)
  let best: { id: string; distance: number } | null = null
  for (const structure of document.structures ?? []) {
    const resolved = resolveStructureEnds(document, sampler, structure)
    if (!resolved) continue
    const { distance } = structurePath(resolved.start, resolved.end, resolved.bend).nearest(q)
    if (distance <= structure.width / 2 + 0.5 && (!best || distance < best.distance)) best = { id: structure.id, distance }
  }
  return best?.id ?? null
}

/** The curve's middle (where the bend handle is drawn), in local metres. */
export function bendHandleAt(resolved: ResolvedStructure): { x: number; y: number } {
  const { start: s, end: e, bend: c } = resolved
  if (!c) return { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 }
  return { x: (s.x + 2 * c.x + e.x) / 4, y: (s.y + 2 * c.y + e.y) / 4 }
}

/** Steps, riser, tread and flight of a stair as drawn (null for ramps). */
export function stairReadout(structure: Structure, resolved: ResolvedStructure) {
  if (structure.form !== 'stairs') return null
  const length = structurePath(resolved.start, resolved.end, resolved.bend).length
  return { length, ...stairShape(resolved.end.h - resolved.start.h, length, structure.flight) }
}

/** Slope (1:N) and the runs between landings of a ramp as drawn (null for stairs). */
export function rampReadout(structure: Structure, resolved: ResolvedStructure) {
  if (structure.form !== 'ramp') return null
  const length = structurePath(resolved.start, resolved.end, resolved.bend).length
  return { length, ...rampShape(resolved.end.h - resolved.start.h, length, structure.landings ?? []) }
}

/** The ramp's landings plus one in the middle of its longest sloped run (fractions of the run). */
export function addLanding(structure: Structure, resolved: ResolvedStructure): number[] {
  const length = structurePath(resolved.start, resolved.end, resolved.bend).length || 1
  const landings = [...(structure.landings ?? [])].sort((a, b) => a - b)
  let best: [number, number] = [0, 0]
  let at = 0
  for (const t of [...landings, Number.POSITIVE_INFINITY]) {
    const a = Number.isFinite(t) ? Math.max(0, t * length - RAMP_LANDING_M / 2) : length
    if (a - at > best[1] - best[0]) best = [at, a]
    if (Number.isFinite(t)) at = Math.max(at, Math.min(length, t * length + RAMP_LANDING_M / 2))
  }
  return [...landings, (best[0] + best[1]) / 2 / length].sort((a, b) => a - b)
}

export type StructureHandle = 'start' | 'end' | 'bend' | 'flight-start' | 'flight-end' | `landing-${number}`

/**
 * The stair after dropping a handle. `end` is the snapped attachment for start/end; `at` is the ground
 * point under the pointer for the bend and flight markers. Re-attaching an end drops its typed height.
 */
export function dropHandle(
  structure: Structure,
  resolved: ResolvedStructure,
  grid: TerrainGrid,
  handle: StructureHandle,
  drop: { end?: StructureEnd; at: LatLng },
): Structure {
  if (handle === 'start' || handle === 'end') {
    const next: Structure = { ...structure, [handle]: drop.end ?? { kind: 'ground', position: drop.at } }
    if (structure.heightOverride?.[handle] !== undefined) {
      const { [handle]: _dropped, ...rest } = structure.heightOverride
      if (Object.keys(rest).length > 0) next.heightOverride = rest
      else delete next.heightOverride
    }
    return next
  }
  const q = toLocal(grid, drop.at)
  if (handle === 'bend') {
    const { start: s, end: e } = resolved
    const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 }
    // Dropped back on the straight line: straight again.
    if (Math.hypot(q.x - mid.x, q.y - mid.y) < 0.3) {
      const { bend: _bend, ...straight } = structure
      return straight
    }
    return { ...structure, bend: toLatLng(grid, { x: 2 * q.x - mid.x, y: 2 * q.y - mid.y }) }
  }
  const path = structurePath(resolved.start, resolved.end, resolved.bend)
  if (handle.startsWith('landing-')) {
    const index = Number(handle.slice('landing-'.length))
    const landings = [...(structure.landings ?? [])]
    if (!(index >= 0 && index < landings.length)) return structure
    landings[index] = Math.min(1, Math.max(0, path.nearest(q).s / (path.length || 1)))
    return { ...structure, landings: landings.sort((a, b) => a - b) }
  }
  const shape = stairShape(resolved.end.h - resolved.start.h, path.length, structure.flight)
  const length = path.length || 1
  const t = path.nearest(q).s / length
  const current = structure.flight ?? { startT: shape.flightStartM / length, endT: shape.flightEndM / length }
  const flight = handle === 'flight-start'
    ? { startT: Math.min(t, current.endT - 0.01), endT: current.endT }
    : { startT: current.startT, endT: Math.max(t, current.startT + 0.01) }
  return { ...structure, flight: { startT: Math.max(0, flight.startT), endT: Math.min(1, flight.endT) } }
}
