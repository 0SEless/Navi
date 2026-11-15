import { recordChange, toLocal } from '@navi/core'
import type { CampusDocument, GroundFit, Road } from '@navi/core'
import type { Command, CommandHandler, MutationResult } from './types'

/** Grade tool (owner 2026-11-15): a road's ground grading — its fit (mode + edge width) and its grade (smoothness, pins). */
type Previous = { roadId: string; groundFit: GroundFit | null; grade: Road['grade'] | null }

const isFit = (value: unknown): value is GroundFit => {
  const fit = value as Partial<GroundFit> | null
  return typeof fit === 'object' && fit !== null && ['off', 'raise', 'lower', 'both'].includes(fit.mode as string)
    && Number.isFinite(fit.blendMeters) && (fit.blendMeters as number) >= 0 && (fit.blendMeters as number) <= 50
}

function lengthOf(road: Road): number {
  const pts = road.polyline?.points ?? []
  if (pts.length < 2) return 0
  const frame = { originLat: pts[0].lat, originLng: pts[0].lng }
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    const a = toLocal(frame, pts[i - 1])
    const b = toLocal(frame, pts[i])
    total += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return total
}

function gradeProblem(road: Road, grade: unknown): string | null {
  const g = grade as { smoothness?: unknown; pins?: unknown }
  if (typeof g !== 'object' || g === null) return 'Choose how the road follows the hill.'
  if (!Number.isFinite(g.smoothness) || (g.smoothness as number) < 0 || (g.smoothness as number) > 1) return 'Smoothness must be between 0 and 1.'
  if (g.pins === undefined) return null
  if (!Array.isArray(g.pins)) return 'Pins must be a list.'
  const length = lengthOf(road)
  for (const pin of g.pins as Array<{ alongM?: unknown; heightM?: unknown }>) {
    if (!Number.isFinite(pin?.alongM) || !Number.isFinite(pin?.heightM)) return 'Each pin needs a place and a height.'
    if ((pin.alongM as number) < 0 || (pin.alongM as number) > length + 0.5) return 'A pin must sit on the road.'
  }
  return null
}

export const roadSetGradeHandler: CommandHandler = {
  id: 'road.set-grade',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const road = document.roads.find((r) => r.id === payload.roadId)
    if (!road) return { success: false, error: 'That road no longer exists.' }
    if (payload.groundFit !== undefined && !isFit(payload.groundFit)) return { success: false, error: 'Choose a valid ground grading.' }
    if (payload.grade !== undefined && payload.grade !== null) {
      const problem = gradeProblem(road, payload.grade)
      if (problem) return { success: false, error: problem }
    }
    const previous: Previous = { roadId: road.id, groundFit: road.groundFit ? { ...road.groundFit } : null, grade: road.grade ? structuredClone(road.grade) : null }
    if (payload.groundFit !== undefined) road.groundFit = { ...(payload.groundFit as GroundFit) }
    if (payload.grade === null) delete road.grade
    else if (payload.grade !== undefined) road.grade = structuredClone(payload.grade as NonNullable<Road['grade']>)
    recordChange(document, { entityId: road.id, entityType: 'road', operation: 'updated' })
    return { success: true, entityId: road.id, data: { previous } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const previous = result.data?.previous as Previous | undefined
    if (!previous) return null
    return { id: 'road.restore-grade', label: 'Undo road grading', payload: previous }
  },
}

/** Puts back a road's grading exactly (absent fields stay absent). */
export const roadRestoreGradeHandler: CommandHandler = {
  id: 'road.restore-grade',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const road = document.roads.find((r) => r.id === payload.roadId)
    if (!road) return { success: false, error: 'That road no longer exists.' }
    const previous: Previous = { roadId: road.id, groundFit: road.groundFit ? { ...road.groundFit } : null, grade: road.grade ? structuredClone(road.grade) : null }
    if (payload.groundFit) road.groundFit = { ...(payload.groundFit as GroundFit) }
    else delete road.groundFit
    if (payload.grade) road.grade = structuredClone(payload.grade as NonNullable<Road['grade']>)
    else delete road.grade
    recordChange(document, { entityId: road.id, entityType: 'road', operation: 'updated' })
    return { success: true, entityId: road.id, data: { previous } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const previous = result.data?.previous as Previous | undefined
    return previous ? { id: 'road.restore-grade', label: 'Redo road grading', payload: previous } : null
  },
}
