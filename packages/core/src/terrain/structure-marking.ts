// Outdoor stairs and ramps in the flat map editor (2026-11-07): the stair's centre line (for its route) and a flat
// marking — the run at its width, a line across for every step and an arrow pointing uphill. Lives beside the
// composer because the ends are resolved on the ground (structures → terrain would be an import cycle).
import type { LatLng } from '../types/coordinates'
import type { CampusDocument } from '../types/document'
import type { Structure } from '../structures/types'
import { structurePath } from '../structures/path'
import { stairShape } from '../structures/stair-shape'
import { resolveStructureEnds } from './compose'
import { toLatLng } from './grid'
import { structureSampler } from './site-artifact'

export interface StairMarking {
  /** Closed ring around the run at the structure's width. */
  outline: LatLng[]
  /** One line across the run per step (stairs only). */
  steps: Array<[LatLng, LatLng]>
  /** From the low side towards the high side. */
  arrow: [LatLng, LatLng]
  /** True when the end is higher than the start. */
  uphillAtEnd: boolean
}

function resolved(doc: CampusDocument, structure: Structure) {
  const sampler = structureSampler(doc)
  if (!sampler) return null
  const ends = resolveStructureEnds(doc, sampler, structure)
  if (!ends) return null
  return { sampler, ends, path: structurePath(ends.start, ends.end, ends.bend) }
}

/** Start → end along the run, one point per metre (both ends included); null when an end cannot be resolved. */
export function structureCentreline(doc: CampusDocument, structure: Structure): LatLng[] | null {
  const r = resolved(doc, structure)
  if (!r) return null
  const count = Math.max(1, Math.round(r.path.length))
  const out: LatLng[] = []
  for (let i = 0; i <= count; i++) out.push(toLatLng(r.sampler.grid, r.path.at((r.path.length * i) / count).p))
  return out
}

/** The flat marking; null when an end cannot be resolved. */
export function stairMarking(doc: CampusDocument, structure: Structure): StairMarking | null {
  const r = resolved(doc, structure)
  if (!r) return null
  const { path, ends, sampler } = r
  const half = structure.width / 2
  const toLL = (p: { x: number; y: number }) => toLatLng(sampler.grid, p)
  const side = (s: number, sign: number) => {
    const { p, n } = path.at(s)
    return toLL({ x: p.x + n.x * half * sign, y: p.y + n.y * half * sign })
  }
  const count = Math.max(1, Math.ceil(path.length))
  const left: LatLng[] = []
  const right: LatLng[] = []
  for (let i = 0; i <= count; i++) {
    const s = (path.length * i) / count
    left.push(side(s, 1))
    right.push(side(s, -1))
  }
  const outline = [...left, ...right.reverse()]
  outline.push(outline[0])

  const rise = ends.end.h - ends.start.h
  const steps: Array<[LatLng, LatLng]> = []
  if (structure.form === 'stairs') {
    const shape = stairShape(rise, path.length, structure.flight)
    for (let k = 0; k < shape.steps; k++) {
      const s = shape.flightStartM + k * shape.treadM
      steps.push([side(s, 1), side(s, -1)])
    }
  }
  const uphillAtEnd = rise > 0
  const low = uphillAtEnd ? 0.25 : 0.75
  const high = uphillAtEnd ? 0.75 : 0.25
  const arrow: [LatLng, LatLng] = [toLL(path.at(path.length * low).p), toLL(path.at(path.length * high).p)]
  return { outline, steps, arrow, uphillAtEnd }
}
