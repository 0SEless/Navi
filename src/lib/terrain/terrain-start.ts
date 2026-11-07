import { gridOriginForBoundary, type CampusDocument, type LatLng } from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'

/** The flat ground's height reference (section 5): nothing to name, rename later if wanted. */
export const FLAT_REFERENCE = { name: 'Campus ground', zeroMeaning: 'The flat starting ground' }

const TOLERANCE = 1e-9

/** The ring without a repeated closing point. */
export function openRing(points: LatLng[]): LatLng[] {
  if (points.length > 3) {
    const first = points[0]
    const last = points[points.length - 1]
    if (Math.abs(first.lat - last.lat) < TOLERANCE && Math.abs(first.lng - last.lng) < TOLERANCE) return points.slice(0, -1)
  }
  return points
}

/** Same corners in the same order (closing point ignored); two missing boundaries are the same. */
export function sameBoundary(a: LatLng[] | null | undefined, b: LatLng[] | null | undefined): boolean {
  if (!a || !b) return !a && !b
  const p = openRing(a)
  const q = openRing(b)
  return p.length === q.length && p.every((point, i) => Math.abs(point.lat - q[i].lat) < TOLERANCE && Math.abs(point.lng - q[i].lng) < TOLERANCE)
}

const usable = (points: LatLng[] | null | undefined): points is LatLng[] => Array.isArray(points) && points.length >= 3

/**
 * What Terrain draws: the document plus, when missing, the boundary drawn at map creation and a flat
 * "Campus ground" terrain. The real document is never changed here.
 */
export function viewDocument(document: CampusDocument, fallback: LatLng[] | null): CampusDocument {
  const ownBoundary = document.boundary?.points
  if (usable(ownBoundary) && document.terrain) return document
  const points = usable(ownBoundary) ? ownBoundary : usable(fallback) ? fallback : null
  const view: CampusDocument = { ...document }
  if (!usable(ownBoundary) && points) view.boundary = { points }
  if (!document.terrain && points) {
    view.terrain = { reference: { ...FLAT_REFERENCE }, grid: gridOriginForBoundary(points), colorRange: { minM: 0, maxM: 40 } }
  }
  return view
}

/** Commands that make the real document match the view before `command` runs. */
export function startCommands(document: CampusDocument, fallback: LatLng[] | null, command: Command): Command[] {
  if (command.id.startsWith('structure.') || command.id.startsWith('structure-preset.')) return []
  const commands: Command[] = []
  if (!usable(document.boundary?.points) && usable(fallback)) {
    commands.push({ id: 'boundary.set', label: 'Use the boundary from map creation', payload: { points: fallback.map((p) => ({ lat: p.lat, lng: p.lng })) } })
  }
  if (!document.terrain && command.id !== 'terrain.setup') {
    commands.push({ id: 'terrain.setup', label: 'Start flat ground', payload: { reference: { ...FLAT_REFERENCE } } })
  }
  return commands
}

/** Runs the start commands, then `command`; stops at the first refusal and returns it. */
export function executeWithStart(
  execute: (command: Command) => MutationResult,
  document: CampusDocument,
  fallback: LatLng[] | null,
  command: Command,
): MutationResult {
  for (const before of startCommands(document, fallback, command)) {
    const result = execute(before)
    if (!result.success) return result
  }
  return execute(command)
}
