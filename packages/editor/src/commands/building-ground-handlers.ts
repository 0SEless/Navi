import { isBankSlope, isGroundAround, recordChange } from '@navi/core'
import type { Building, CampusDocument, GroundFit } from '@navi/core'
import type { Command, CommandHandler, MutationResult } from './types'

// Terrain plan: how a building sits on the ground. Follow ground = mean ground under the outline;
// Fixed = baseElevation as typed. The pad reshapes the ground around the building (default both, 3 m).

export const DEFAULT_PAD: GroundFit = { mode: 'both', blendMeters: 3 }

type Previous = { buildingId: string; ground: Building['ground'] | null; baseElevation: number }

function isFit(value: unknown): value is GroundFit {
  if (typeof value !== 'object' || value === null) return false
  const fit = value as Record<string, unknown>
  return ['off', 'raise', 'lower', 'both'].includes(fit.mode as string) && Number.isFinite(fit.blendMeters) && (fit.blendMeters as number) >= 0
}

function snapshot(building: Building): Previous {
  return { buildingId: building.id, ground: building.ground ? structuredClone(building.ground) : null, baseElevation: building.baseElevation }
}

function restore(document: CampusDocument, previous: Previous[]): void {
  for (const p of previous) {
    const building = document.buildings.find((b) => b.id === p.buildingId)
    if (!building) continue
    building.baseElevation = p.baseElevation
    if (p.ground) building.ground = structuredClone(p.ground)
    else delete building.ground
  }
}

/** Sets one building's base mode (and typed base) and pad. Lock zone: that building. */
export const buildingSetGroundHandler: CommandHandler = {
  id: 'building.set-ground',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    if (payload.restore !== undefined) {
      restore(document, payload.restore as Previous[])
      return { success: true, entityId: String((payload.restore as Previous[])[0]?.buildingId ?? ''), data: { previous: [] } }
    }
    const building = document.buildings.find((b) => b.id === payload.buildingId)
    if (!building) return { success: false, error: `Building not found: ${String(payload.buildingId)}` }
    const baseMode = payload.baseMode
    if (baseMode !== 'follow-ground' && baseMode !== 'fixed') return { success: false, error: 'Base must follow the ground or be fixed.' }
    if (payload.baseElevation !== undefined && !Number.isFinite(payload.baseElevation)) return { success: false, error: 'The base height must be a number.' }
    if (payload.pad !== undefined && !isFit(payload.pad)) return { success: false, error: 'The pad needs a mode and a blend width.' }
    if (payload.around !== undefined && !isGroundAround(payload.around)) return { success: false, error: 'Choose bank and plinth, slopes all round or leave the hill.' }
    if (payload.bankSlope !== undefined && !isBankSlope(payload.bankSlope)) return { success: false, error: 'Choose a gentle, normal or steep bank.' }
    const previous = [snapshot(building)]
    // Ground around and Bank slope (banks and plinths, 2026-11-15) are kept unless this change sets them.
    const around = isGroundAround(payload.around) ? payload.around : building.ground?.around
    const bankSlope = isBankSlope(payload.bankSlope) ? payload.bankSlope : building.ground?.bankSlope
    building.ground = {
      baseMode,
      pad: isFit(payload.pad) ? { ...payload.pad } : building.ground?.pad ?? { ...DEFAULT_PAD },
      ...(around ? { around } : {}),
      ...(bankSlope ? { bankSlope } : {}),
    }
    if (typeof payload.baseElevation === 'number') building.baseElevation = payload.baseElevation
    recordChange(document, { entityId: building.id, entityType: 'building', operation: 'updated' })
    return { success: true, entityId: building.id, data: { previous } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const previous = result.data?.previous as Previous[] | undefined
    return previous && previous.length > 0 ? { id: 'building.set-ground', label: 'Undo building ground', payload: { restore: previous } } : null
  },
}

/** After an import: every building that is not Fixed follows the ground (one undo step). */
export const buildingsFollowGroundHandler: CommandHandler = {
  id: 'buildings.follow-ground',
  execute(document: CampusDocument): MutationResult {
    const previous: Previous[] = []
    for (const building of document.buildings) {
      if (building.ground?.baseMode === 'fixed') continue
      previous.push(snapshot(building))
      building.ground = { ...building.ground, baseMode: 'follow-ground', pad: building.ground?.pad ?? { ...DEFAULT_PAD } }
      recordChange(document, { entityId: building.id, entityType: 'building', operation: 'updated' })
    }
    return { success: true, entityId: 'buildings', data: { previous } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const previous = result.data?.previous as Previous[] | undefined
    return previous && previous.length > 0 ? { id: 'building.set-ground', label: 'Undo follow the ground', payload: { restore: previous } } : null
  },
}
