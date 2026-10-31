import { recordChange } from '@navi/core'
import type { CampusDocument, TerrainArea, TerrainVerticalDatum, LatLng } from '@navi/core'
import type { Command, CommandHandler, MutationResult } from './types'
import { isSimpleTerrainPolygon } from '@navi/core'

function isDatum(value: unknown): value is TerrainVerticalDatum {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const datum = value as Record<string, unknown>
  return datum.kind === 'campus-local'
    && typeof datum.name === 'string' && datum.name.trim().length > 0
    && typeof datum.zeroReference === 'string' && datum.zeroReference.trim().length > 0
    && datum.elevationStatus === 'authored-not-surveyed'
}

function validPoints(value: unknown): value is LatLng[] {
  return Array.isArray(value) && isSimpleTerrainPolygon(value as LatLng[])
}

function validateArea(value: unknown, datum: unknown): value is TerrainArea {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !isDatum(datum)) return false
  const area = value as Record<string, unknown>
  return typeof area.id === 'string' && area.id.trim().length > 0
    && typeof area.name === 'string' && area.name.trim().length > 0
    && validPoints(area.points)
    && typeof area.color === 'string' && area.color.trim().length > 0
    && typeof area.elevationMeters === 'number' && Number.isFinite(area.elevationMeters)
}

function copyAreas(document: CampusDocument): TerrainArea[] {
  return document.terrainAreas ? structuredClone(document.terrainAreas) : []
}

export const terrainAreaCreateHandler: CommandHandler = {
  id: 'terrain-area.create',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const id = typeof payload.id === 'string' ? payload.id : ''
    const candidate = {
      id,
      name: payload.name,
      points: payload.points,
      color: payload.color,
      elevationMeters: payload.elevationMeters,
    }
    const datum = payload.datum ?? document.terrainVerticalDatum
    if (!validateArea(candidate, datum)) return { success: false, error: 'Terrain area requires a valid polygon, name, finite elevation, and explicit campus-local datum.' }
    if ((document.terrainAreas ?? []).some((area) => area.id === id)) return { success: false, error: `Terrain area already exists: ${id}` }

    const previousAreasAbsent = document.terrainAreas === undefined
    const previousDatum = document.terrainVerticalDatum ? structuredClone(document.terrainVerticalDatum) : undefined
    document.terrainVerticalDatum = structuredClone(datum) as TerrainVerticalDatum
    document.terrainAreas = [...copyAreas(document), structuredClone(candidate)]
    recordChange(document, { entityId: id, entityType: 'terrain-area', operation: 'created' })
    return { success: true, entityId: id, data: { id, previousAreasAbsent, previousDatum } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const id = typeof result.data?.id === 'string' ? result.data.id : result.entityId
    return id ? {
      id: 'terrain-area.delete', label: 'Undo Create Terrain Area',
      payload: { areaId: id, restoreAbsent: result.data?.previousAreasAbsent === true, restoreDatum: result.data?.previousDatum },
    } : null
  },
}

export const terrainAreaUpdateHandler: CommandHandler = {
  id: 'terrain-area.update',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const areaId = typeof payload.areaId === 'string' ? payload.areaId : ''
    const index = (document.terrainAreas ?? []).findIndex((area) => area.id === areaId)
    if (index < 0) return { success: false, error: `Terrain area not found: ${areaId}` }
    const changes = payload.changes && typeof payload.changes === 'object' && !Array.isArray(payload.changes)
      ? payload.changes as Record<string, unknown>
      : {}
    const previousArea = structuredClone(document.terrainAreas![index])
    const previousDatum = document.terrainVerticalDatum ? structuredClone(document.terrainVerticalDatum) : undefined
    const candidate = { ...previousArea, ...changes, id: areaId }
    const datum = changes.datum ?? document.terrainVerticalDatum
    delete (candidate as Record<string, unknown>).datum
    if (!validateArea(candidate, datum)) return { success: false, error: 'Terrain area update requires valid geometry, a finite elevation, and explicit campus-local datum.' }
    document.terrainAreas = copyAreas(document)
    document.terrainAreas[index] = structuredClone(candidate)
    if (changes.datum !== undefined) document.terrainVerticalDatum = structuredClone(changes.datum) as TerrainVerticalDatum
    recordChange(document, { entityId: areaId, entityType: 'terrain-area', operation: 'updated' })
    return { success: true, entityId: areaId, data: { previousArea, previousDatum } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const areaId = typeof payload.areaId === 'string' ? payload.areaId : ''
    const previousArea = result.data?.previousArea
    return areaId && previousArea
      ? {
        id: 'terrain-area.update',
        label: 'Undo Edit Terrain Area',
        payload: { areaId, changes: { ...previousArea as object, ...(isDatum(result.data?.previousDatum) ? { datum: result.data.previousDatum } : {}) } },
      }
      : null
  },
}

export const terrainAreaDeleteHandler: CommandHandler = {
  id: 'terrain-area.delete',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const areaId = typeof payload.areaId === 'string' ? payload.areaId : ''
    const areas = copyAreas(document)
    const index = areas.findIndex((area) => area.id === areaId)
    if (index < 0) return { success: false, error: `Terrain area not found: ${areaId}` }
    const [previousArea] = areas.splice(index, 1)
    const previousDatum = document.terrainVerticalDatum ? structuredClone(document.terrainVerticalDatum) : undefined
    document.terrainAreas = payload.restoreAbsent === true && areas.length === 0 ? undefined : areas
    if (payload.restoreAbsent === true) {
      if (isDatum(payload.restoreDatum)) document.terrainVerticalDatum = structuredClone(payload.restoreDatum)
      else delete document.terrainVerticalDatum
    }
    recordChange(document, { entityId: areaId, entityType: 'terrain-area', operation: 'deleted' })
    return { success: true, entityId: areaId, data: { previousArea, previousDatum } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const area = result.data?.previousArea as TerrainArea | undefined
    return area && isDatum(result.data?.previousDatum)
      ? { id: 'terrain-area.create', label: 'Undo Delete Terrain Area', payload: { ...area, datum: result.data.previousDatum } }
      : null
  },
}
