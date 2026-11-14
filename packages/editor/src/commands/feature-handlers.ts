import {floorConnectionProblem,ownWallOf} from '../geometry/floor-connections'
import { autoLinkFeature, clearFeatureLinks, type FeatureKind } from '../navigation/feature-links'
import { recordChange, collectFloorDoors } from '@navi/core'
import type { CampusDocument, Staircase, Elevator, LocalCoord, LocalPolygon, StaircaseType, ElevatorType, PointOfInterest, PointOfInterestAppearance, PointOfInterestGeometry, PointOfInterestNavigation, PointOfInterestVisibility, OutdoorPointOfInterest, WorldPOIGeometry, RoomDoor, Window, Opening, VerticalTransition, RouteNetwork } from '@navi/core'
import { DOOR_OPERATIONS, HINGE_SIDES, SWING_SIDES, OPENING_MATERIALS, GLASS_TYPES, findDoorPreset, findWindowPreset, resolveDoorStyle, resolveWindowStyle, WINDOW_APPEARANCES, WINDOW_POSES, isPOICategory, isDoorType, isKnownRoomId, resolvePointOfInterestGeometry, validatePointOfInterestAppearance, validatePointOfInterestGeometry, validateWorldPointOfInterestGeometry, validatePoiNavigation, validatePoiVisibility } from '@navi/core'
import type { CommandHandler, Command, MutationResult } from './types'
import { genId } from '../id'
import { syncFeatureRoutePort,featureRouteNetworkSnapshot,restoreFeatureRouteNetwork,removeFeatureRoutePort } from '../geometry/feature-route-port'
import { resolveLevelGeometry } from '../geometry/resolve-level-geometry'
import { featureDimensions, resizeFeatureGeometry } from '../geometry/feature-dimensions'
import { cleanupFeatureRoutingReferences, collectDoorConnectorEdgeIds, isRouteNodeReferencedByAccessRelationships } from './routing-relationship-cleanup'
import { applyRouteJunctionSplit } from './route-junctions'
import { collectFloorRoomOwnershipPolygons, resolveUniqueRoomOwner } from '../geometry/room-ownership'
import { buildDuplicatedDoor } from './duplicate-helpers'
import { placeDuplicatedDoor } from '../geometry/door-duplicate-placement'
import { findPlacementWall } from '../geometry/door-placement'
import { validateDoorWallAttachment } from '../geometry/door-wall-attachment'
import { computeOffsetFromPosition } from '../geometry/opening-position'
const DOOR_APPEARANCES = ['open','solid','glass','double-solid','double-glass']
const DOOR_POSES = ['closed','ajar','open']
/** Decorative door fields: edits touching only these never normalize geometry or routing. */
const COSMETIC_DOOR_KEYS = ['doorAppearance','doorPose','doorOperation','hingeSide','swingSide','assetPreset','material','glass'] as const
/** First invalid decorative style field, or undefined. Absent (undefined) fields are valid. */
export function doorStyleFieldError(fields: Record<string, unknown>): string | undefined {
  if (fields.doorOperation !== undefined && !(DOOR_OPERATIONS as readonly unknown[]).includes(fields.doorOperation)) return 'Door operation must be hinged, sliding, folding, rolling or none'
  if (fields.hingeSide !== undefined && !(HINGE_SIDES as readonly unknown[]).includes(fields.hingeSide)) return 'Hinge side must be start or end'
  if (fields.swingSide !== undefined && !(SWING_SIDES as readonly unknown[]).includes(fields.swingSide)) return 'Swing side must be left or right'
  if (fields.assetPreset !== undefined && (typeof fields.assetPreset !== 'string' || !findDoorPreset(fields.assetPreset))) return 'Unknown door preset'
  if (fields.material !== undefined && !(OPENING_MATERIALS as readonly unknown[]).includes(fields.material)) return 'Material must be wood, painted-steel, aluminium or fire-red'
  if (fields.glass !== undefined && !(GLASS_TYPES as readonly unknown[]).includes(fields.glass)) return 'Glass must be clear, frosted or tinted'
  return undefined
}
/** First invalid decorative window field, or undefined. A window pose needs a casement, awning or jalousie look. */
export function windowStyleFieldError(fields: Record<string, unknown>): string | undefined {
  if (fields.windowAppearance !== undefined && !(WINDOW_APPEARANCES as readonly unknown[]).includes(fields.windowAppearance)) return 'Window appearance must be one of ' + WINDOW_APPEARANCES.join(', ')
  if (fields.assetPreset !== undefined && (typeof fields.assetPreset !== 'string' || !findWindowPreset(fields.assetPreset))) return 'Unknown window preset'
  if (fields.material !== undefined && !(OPENING_MATERIALS as readonly unknown[]).includes(fields.material)) return 'Material must be wood, painted-steel, aluminium or fire-red'
  if (fields.glass !== undefined && !(GLASS_TYPES as readonly unknown[]).includes(fields.glass)) return 'Glass must be clear, frosted or tinted'
  if (fields.windowPose !== undefined) {
    if (!(WINDOW_POSES as readonly unknown[]).includes(fields.windowPose)) return 'Window position must be closed or open'
    const type = resolveWindowStyle(fields as Parameters<typeof resolveWindowStyle>[0]).type
    if (type !== 'casement' && type !== 'awning' && type !== 'jalousie') return 'Window position applies to casement, awning and jalousie windows only'
  }
  return undefined
}

// ── P1-T5 (R2.2): POI handlers ──
// POIs are floor-local discovery landmarks — NOT rooms, never destination
// leaves. Category is validated against the closed POICategory enum.
// R15.6: ids come from the shared genId; R15.5: id is identity, name is
// display-only (never derived from each other).

type PoiRecord =
  | { kind: 'outdoor'; poi: OutdoorPointOfInterest }
  | { kind: 'indoor'; building: CampusDocument['buildings'][number]; floor: CampusDocument['buildings'][number]['floors'][number]; poi: PointOfInterest }

/** Locate a POI in either canonical scope (campus/outdoor first, then floors). */
function findPoiRecord(document: CampusDocument, poiId: string): PoiRecord | null {
  for (const poi of document.pois ?? []) {
    if (poi.id === poiId) return { kind: 'outdoor', poi }
  }
  for (const building of document.buildings) {
    for (const floor of building.floors) {
      const poi = floor.pois?.find(p => p.id === poiId)
      if (poi) return { kind: 'indoor', building, floor, poi }
    }
  }
  return null
}

/** True when the id is already used by an indoor or outdoor POI (identity is global). */
function poiIdExists(document: CampusDocument, poiId: string): boolean {
  return findPoiRecord(document, poiId) !== null
}

function readOutdoorPoiGeometry(input: Record<string, unknown>):
  | { success: true; geometry: WorldPOIGeometry }
  | { success: false; error: string } {
  if (input.position !== undefined) {
    return { success: false, error: 'Outdoor POI uses world geometry only; position is not permitted' }
  }
  const geometry = input.geometry
  if (geometry === undefined) {
    return { success: false, error: 'Outdoor POI requires a world geometry object' }
  }
  const validation = validateWorldPointOfInterestGeometry(geometry)
  if (!validation.valid) return { success: false, error: validation.error }
  return { success: true, geometry: structuredClone(geometry as WorldPOIGeometry) }
}

/**
 * Read an optional visibility/navigation patch (used by poi.update).
 *  - absent            → no change
 *  - null              → clear the field
 *  - undefined present → error (same contract as appearance)
 *  - value             → validated against the POI's next geometry
 */
function readPoiOptionPatch(
  patch: Record<string, unknown>,
  key: 'visibility' | 'navigation',
  geometry: { type: 'point' | 'circle' | 'rectangle' | 'polygon' },
): { present: boolean; value?: unknown; error?: string } {
  if (!Object.prototype.hasOwnProperty.call(patch, key)) return { present: false }
  const value = patch[key]
  if (value === undefined) return { present: false, error: `POI ${key} must be omitted or explicitly cleared with null` }
  if (value === null) return { present: true, value: undefined }
  const validation = key === 'visibility'
    ? validatePoiVisibility(value)
    : validatePoiNavigation(value, geometry)
  if (!validation.valid) return { present: false, error: validation.error }
  return { present: true, value }
}

type PoiSpatialSource =
  | { position: LocalCoord; geometry?: never }
  | { geometry: PointOfInterestGeometry; position?: never }

function hasPoiGeometry(source: PoiSpatialSource): source is { geometry: PointOfInterestGeometry; position?: never } {
  return 'geometry' in source && source.geometry !== undefined
}

function readPoiSpatialSource(input: Record<string, unknown>, required: boolean):
  | { success: true; spatial?: PoiSpatialSource }
  | { success: false; error: string } {
  const hasPosition = input.position !== undefined
  const hasGeometry = input.geometry !== undefined
  if (!hasPosition && !hasGeometry) {
    return required
      ? { success: false, error: 'POI requires exactly one spatial source: position or geometry' }
      : { success: true }
  }
  if (hasPosition && hasGeometry) {
    return { success: false, error: 'POI cannot define both position and geometry' }
  }

  if (hasPosition) {
    const position = input.position
    const validation = validatePointOfInterestGeometry({ type: 'point', position })
    if (!validation.valid) return { success: false, error: validation.error }
    const localPosition = position as LocalCoord
    return { success: true, spatial: { position: { x: localPosition.x, y: localPosition.y } } }
  }

  const geometry = input.geometry
  const validation = validatePointOfInterestGeometry(geometry)
  if (!validation.valid) return { success: false, error: validation.error }
  return { success: true, spatial: { geometry: structuredClone(geometry as PointOfInterestGeometry) } }
}

function applyPoiSpatialSource(poi: PointOfInterest, spatial: PoiSpatialSource): void {
  const mutablePoi = poi as PointOfInterest & Record<string, unknown>
  delete mutablePoi.position
  delete mutablePoi.geometry
  if (!hasPoiGeometry(spatial)) mutablePoi.position = { x: spatial.position.x, y: spatial.position.y }
  else mutablePoi.geometry = structuredClone(spatial.geometry)
}

function currentPoiSpatialSource(poi: PointOfInterest): PoiSpatialSource {
  if ('geometry' in poi && poi.geometry !== undefined) {
    return { geometry: structuredClone(poi.geometry) }
  }
  return { position: { ...poi.position } }
}

function spatialSourceGeometry(spatial: PoiSpatialSource): PointOfInterestGeometry {
  return hasPoiGeometry(spatial)
    ? spatial.geometry
    : { type: 'point', position: { ...spatial.position } }
}

export const poiCreateHandler: CommandHandler = {
  id: 'poi.create',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    // Outdoor/campus scope: world geometry, no building/floor context.
    if (payload.scope === 'outdoor') {
      const category = payload.category
      if (!isPOICategory(category)) {
        return { success: false, error: `Invalid POI category: ${String(category)}. Must be one of the POICategory enum values.` }
      }
      if (payload.buildingId !== undefined || payload.floorId !== undefined) {
        return { success: false, error: 'Outdoor POI must not define buildingId or floorId' }
      }
      const geometryResult = readOutdoorPoiGeometry(payload)
      if (!geometryResult.success) return { success: false, error: geometryResult.error }
      const appearanceValidation = validatePointOfInterestAppearance(payload.appearance, geometryResult.geometry)
      if (!appearanceValidation.valid) return { success: false, error: appearanceValidation.error }
      const visibilityValidation = validatePoiVisibility(payload.visibility)
      if (!visibilityValidation.valid) return { success: false, error: visibilityValidation.error }
      const navigationValidation = validatePoiNavigation(payload.navigation, geometryResult.geometry)
      if (!navigationValidation.valid) return { success: false, error: navigationValidation.error }

      const id = (payload.id as string) || genId('poi')
      if (poiIdExists(document, id)) {
        return { success: false, error: `POI_ID_COLLISION ${id}: POI id is already in use` }
      }
      const poi: OutdoorPointOfInterest = {
        id,
        name: (payload.name as string) ?? '',
        category,
        scope: 'outdoor',
        geometry: geometryResult.geometry,
        metadata: (payload.metadata as Record<string, unknown>) ?? {},
        ...(payload.appearance !== undefined ? { appearance: structuredClone(payload.appearance as PointOfInterestAppearance) } : {}),
        ...(payload.visibility !== undefined ? { visibility: structuredClone(payload.visibility as PointOfInterestVisibility) } : {}),
        ...(payload.navigation !== undefined ? { navigation: structuredClone(payload.navigation as PointOfInterestNavigation) } : {}),
      }
      if (!document.pois) document.pois = []
      document.pois.push(poi)

      recordChange(document, { entityId: id, entityType: 'poi', operation: 'created' })
      return { success: true, entityId: id, data: { id, scope: 'outdoor' } }
    }
    if (payload.scope !== undefined && payload.scope !== 'indoor') {
      return { success: false, error: `Unknown POI scope: ${String(payload.scope)}` }
    }

    const buildingId = payload.buildingId as string
    const floorId = payload.floorId as string
    const building = document.buildings.find(b => b.id === buildingId)
    if (!building) return { success: false, error: `Building not found: ${buildingId}` }
    const floor = building.floors.find(f => f.id === floorId)
    if (!floor) return { success: false, error: `Floor not found: ${floorId}` }
    const category = payload.category
    if (!isPOICategory(category)) {
      return { success: false, error: `Invalid POI category: ${String(category)}. Must be one of the POICategory enum values.` }
    }

    const spatialResult = readPoiSpatialSource(payload, true)
    if (!spatialResult.success) return { success: false, error: spatialResult.error }
    const spatial = spatialResult.spatial
    if (!spatial) return { success: false, error: 'POI requires a spatial source' }
    const appearanceValidation = validatePointOfInterestAppearance(payload.appearance, spatialSourceGeometry(spatial))
    if (!appearanceValidation.valid) return { success: false, error: appearanceValidation.error }
    const visibilityValidation = validatePoiVisibility(payload.visibility)
    if (!visibilityValidation.valid) return { success: false, error: visibilityValidation.error }
    const navigationValidation = validatePoiNavigation(payload.navigation, spatialSourceGeometry(spatial))
    if (!navigationValidation.valid) return { success: false, error: navigationValidation.error }
    const id = (payload.id as string) || genId('poi')
    if (poiIdExists(document, id)) {
      return { success: false, error: `POI_ID_COLLISION ${id}: POI id is already in use` }
    }

    const poi: PointOfInterest = {
      id,
      name: (payload.name as string) ?? '',
      category,
      // Building-local only — never world LatLng (R2.2).
      ...(hasPoiGeometry(spatial) ? { geometry: spatial.geometry } : { position: spatial.position }),
      metadata: (payload.metadata as Record<string, unknown>) ?? {},
      ...(payload.appearance !== undefined ? { appearance: structuredClone(payload.appearance as PointOfInterestAppearance) } : {}),
      ...(payload.visibility !== undefined ? { visibility: structuredClone(payload.visibility as PointOfInterestVisibility) } : {}),
      ...(payload.navigation !== undefined ? { navigation: structuredClone(payload.navigation as PointOfInterestNavigation) } : {}),
    }
    if (!floor.pois) floor.pois = []
    floor.pois.push(poi)

    recordChange(document, { entityId: id, entityType: 'poi', operation: 'created' })
    return { success: true, entityId: id, data: { id, buildingId, floorId } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const id = result.entityId ?? (payload.id as string)
    return {
      id: 'poi.delete',
      label: 'Undo Create POI',
      payload: { poiId: id },
    }
  },
}

export const poiUpdateHandler: CommandHandler = {
  id: 'poi.update',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const poiId = payload.poiId as string
    const patch = (payload.patch as Record<string, unknown>) ?? {}

    const record = findPoiRecord(document, poiId)
    if (!record) return { success: false, error: `POI not found: ${poiId}` }

    if (patch.category !== undefined && !isPOICategory(patch.category)) {
      return { success: false, error: `Invalid POI category: ${String(patch.category)}. Must be one of the POICategory enum values.` }
    }

    if (record.kind === 'outdoor') {
      const poi = record.poi
      if (patch.position !== undefined) {
        return { success: false, error: 'Outdoor POI uses world geometry only; position is not permitted' }
      }
      const spatialPatchPresent = patch.geometry !== undefined
      const appearancePatchPresent = Object.prototype.hasOwnProperty.call(patch, 'appearance')
      if (appearancePatchPresent && patch.appearance === undefined) {
        return { success: false, error: 'POI appearance must be omitted or explicitly cleared with null' }
      }

      let nextGeometry: WorldPOIGeometry = structuredClone(poi.geometry)
      if (spatialPatchPresent) {
        const geometryResult = readOutdoorPoiGeometry({ geometry: patch.geometry })
        if (!geometryResult.success) return { success: false, error: geometryResult.error }
        nextGeometry = geometryResult.geometry
      }
      if (appearancePatchPresent && patch.appearance !== null) {
        const appearanceValidation = validatePointOfInterestAppearance(patch.appearance, nextGeometry)
        if (!appearanceValidation.valid) return { success: false, error: appearanceValidation.error }
      }
      const visibilityPatch = readPoiOptionPatch(patch, 'visibility', nextGeometry)
      if (visibilityPatch.error) return { success: false, error: visibilityPatch.error }
      const navigationPatch = readPoiOptionPatch(patch, 'navigation', nextGeometry)
      if (navigationPatch.error) return { success: false, error: navigationPatch.error }

      const old = {
        name: poi.name,
        category: poi.category,
        geometry: structuredClone(poi.geometry),
        appearance: poi.appearance !== undefined ? structuredClone(poi.appearance) : null,
        visibility: poi.visibility !== undefined ? structuredClone(poi.visibility) : null,
        navigation: poi.navigation !== undefined ? structuredClone(poi.navigation) : null,
      }

      if (patch.name != null) poi.name = patch.name as string
      if (patch.category != null) poi.category = patch.category as PointOfInterest['category']
      if (spatialPatchPresent) poi.geometry = nextGeometry
      if (appearancePatchPresent) {
        const mutablePoi = poi as OutdoorPointOfInterest & Record<string, unknown>
        if (patch.appearance === null) delete mutablePoi.appearance
        else mutablePoi.appearance = structuredClone(patch.appearance as PointOfInterestAppearance)
      }
      if (visibilityPatch.present) {
        const mutablePoi = poi as OutdoorPointOfInterest & Record<string, unknown>
        if (visibilityPatch.value === undefined) delete mutablePoi.visibility
        else mutablePoi.visibility = structuredClone(visibilityPatch.value as PointOfInterestVisibility)
      }
      if (navigationPatch.present) {
        const mutablePoi = poi as OutdoorPointOfInterest & Record<string, unknown>
        if (navigationPatch.value === undefined) delete mutablePoi.navigation
        else mutablePoi.navigation = structuredClone(navigationPatch.value as PointOfInterestNavigation)
      }

      recordChange(document, { entityId: poiId, entityType: 'poi', operation: 'updated' })
      return { success: true, entityId: poiId, data: { old } }
    }

    const ctx = record
    const spatialPatchPresent = patch.position !== undefined || patch.geometry !== undefined
    const appearancePatchPresent = Object.prototype.hasOwnProperty.call(patch, 'appearance')
    const spatialResult = readPoiSpatialSource(patch, false)
    if (!spatialResult.success) return { success: false, error: spatialResult.error }

    if (appearancePatchPresent && patch.appearance === undefined) {
      return { success: false, error: 'POI appearance must be omitted or explicitly cleared with null' }
    }
    const nextGeometry = spatialResult.spatial
      ? spatialSourceGeometry(spatialResult.spatial)
      : resolvePointOfInterestGeometry(ctx.poi)
    if (!nextGeometry) return { success: false, error: 'POI has no valid geometry' }
    if (appearancePatchPresent && patch.appearance !== null) {
      const appearanceValidation = validatePointOfInterestAppearance(patch.appearance, nextGeometry)
      if (!appearanceValidation.valid) return { success: false, error: appearanceValidation.error }
    }
    const visibilityPatch = readPoiOptionPatch(patch, 'visibility', nextGeometry)
    if (visibilityPatch.error) return { success: false, error: visibilityPatch.error }
    const navigationPatch = readPoiOptionPatch(patch, 'navigation', nextGeometry)
    if (navigationPatch.error) return { success: false, error: navigationPatch.error }

    const old = {
      name: ctx.poi.name,
      category: ctx.poi.category,
      ...currentPoiSpatialSource(ctx.poi),
      appearance: ctx.poi.appearance !== undefined
        ? structuredClone(ctx.poi.appearance)
        : null,
      visibility: ctx.poi.visibility !== undefined ? structuredClone(ctx.poi.visibility) : null,
      navigation: ctx.poi.navigation !== undefined ? structuredClone(ctx.poi.navigation) : null,
    }

    if (patch.name != null) ctx.poi.name = patch.name as string
    if (patch.category != null) ctx.poi.category = patch.category as PointOfInterest['category']
    if (spatialPatchPresent && spatialResult.spatial) applyPoiSpatialSource(ctx.poi, spatialResult.spatial)
    if (appearancePatchPresent) {
      const mutablePoi = ctx.poi as PointOfInterest & Record<string, unknown>
      if (patch.appearance === null) delete mutablePoi.appearance
      else mutablePoi.appearance = structuredClone(patch.appearance as PointOfInterestAppearance)
    }
    if (visibilityPatch.present) {
      const mutablePoi = ctx.poi as PointOfInterest & Record<string, unknown>
      if (visibilityPatch.value === undefined) delete mutablePoi.visibility
      else mutablePoi.visibility = structuredClone(visibilityPatch.value as PointOfInterestVisibility)
    }
    if (navigationPatch.present) {
      const mutablePoi = ctx.poi as PointOfInterest & Record<string, unknown>
      if (navigationPatch.value === undefined) delete mutablePoi.navigation
      else mutablePoi.navigation = structuredClone(navigationPatch.value as PointOfInterestNavigation)
    }

    recordChange(document, { entityId: poiId, entityType: 'poi', operation: 'updated' })
    return { success: true, entityId: poiId, data: { old } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const old = result.data?.old as Record<string, unknown> | undefined
    if (!old) return null
    return {
      id: 'poi.update',
      label: 'Undo POI Update',
      payload: { poiId: payload.poiId as string, patch: old },
    }
  },
}

export const poiDeleteHandler: CommandHandler = {
  id: 'poi.delete',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const poiId = payload.poiId as string
    const record = findPoiRecord(document, poiId)
    if (!record) return { success: false, error: `POI not found: ${poiId}` }

    if (record.kind === 'outdoor') {
      const oldPoi = JSON.parse(JSON.stringify(record.poi)) as OutdoorPointOfInterest
      document.pois = (document.pois ?? []).filter(p => p.id !== poiId)
      if (document.pois.length === 0) delete document.pois

      recordChange(document, { entityId: poiId, entityType: 'poi', operation: 'deleted' })
      return { success: true, entityId: poiId, data: { oldPoi, scope: 'outdoor' } }
    }

    const oldPoi = JSON.parse(JSON.stringify(record.poi)) as PointOfInterest
    record.floor.pois = record.floor.pois!.filter(p => p.id !== poiId)

    recordChange(document, { entityId: poiId, entityType: 'poi', operation: 'deleted' })
    return { success: true, entityId: poiId, data: { oldPoi, buildingId: record.building.id, floorId: record.floor.id } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const oldPoi = result.data?.oldPoi as (PointOfInterest | OutdoorPointOfInterest) | undefined
    if (!oldPoi) return null
    if ('scope' in oldPoi && oldPoi.scope === 'outdoor') {
      return {
        id: 'poi.create',
        label: 'Undo Delete POI',
        payload: {
          id: oldPoi.id,
          name: oldPoi.name,
          category: oldPoi.category,
          scope: 'outdoor',
          geometry: structuredClone(oldPoi.geometry),
          metadata: oldPoi.metadata,
          ...(oldPoi.appearance !== undefined ? { appearance: structuredClone(oldPoi.appearance) } : {}),
        },
      }
    }
    return {
      id: 'poi.create',
      label: 'Undo Delete POI',
      payload: {
        id: oldPoi.id,
        name: oldPoi.name,
        category: oldPoi.category,
        position: (oldPoi as PointOfInterest).position,
        ...(currentPoiSpatialSource(oldPoi as PointOfInterest) as Record<string, unknown>),
        metadata: oldPoi.metadata,
        ...(oldPoi.appearance !== undefined ? { appearance: structuredClone(oldPoi.appearance) } : {}),
        buildingId: result.data?.buildingId as string,
        floorId: result.data?.floorId as string,
      },
    }
  },
}

// ── P1-T6 (R2.4/R9.2/D7): RoomDoor handlers ──
// Doors are their own entities living at Floor.doors (extracted from Room
// nesting). Every command addresses the door BY ID — never through the
// owning room's edit path. R15.6: shared genId('door'); R15.5: id is
// identity; positions building-local meters only.

function findFloorAndDoor(document: CampusDocument, doorId: string) {
  for (const building of document.buildings) {
    for (const floor of building.floors) {
      const door = floor.doors?.find(d => d.id === doorId)
      if (door) return { building, floor, door }
    }
  }
  return null
}

export const doorCreateHandler: CommandHandler = {
  id: 'door.create',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const buildingId = payload.buildingId as string
    const floorId = payload.floorId as string
    const building = document.buildings.find(b => b.id === buildingId)
    if (!building) return { success: false, error: `Building not found: ${buildingId}` }
    const floor = building.floors.find(f => f.id === floorId)
    if (!floor) return { success: false, error: `Floor not found: ${floorId}` }
    const requestedRoomId = payload.roomId as string | undefined
    const doorInput = (payload.door as Record<string, unknown>) ?? {}
    if (payload.restoreDoor !== undefined) {
      const restored = structuredClone(payload.restoreDoor) as RoomDoor
      if (!restored?.id || typeof restored.id !== 'string' || !restored.position) return { success: false, error: 'Invalid door snapshot' }
      if (collectFloorDoors(floor).some(door => door.id === restored.id)) return { success: false, error: 'Door already exists: ' + restored.id }
      if (!floor.doors) floor.doors = []
      const restoreIndex = typeof payload.restoreIndex === 'number' ? payload.restoreIndex : floor.doors.length
      floor.doors.splice(restoreIndex, 0, restored)
      if ('restoreNetwork' in payload) {
        const state = payload.restoreNetwork as { present: boolean; value: RouteNetwork | undefined }
        if (state.present) floor.routeNetwork = structuredClone(state.value)
        else delete floor.routeNetwork
      }
      recordChange(document, { entityId: restored.id, entityType: 'door', operation: 'created' })
      return { success: true, entityId: restored.id, data: { id: restored.id, buildingId, floorId } }
    }
    if (requestedRoomId !== undefined && !isKnownRoomId(floor, requestedRoomId)) {
      return { success: false, error: `Room not found: ${requestedRoomId}` }
    }
    if (doorInput.doorAppearance !== undefined && !DOOR_APPEARANCES.includes(doorInput.doorAppearance as string)) return { success: false, error: 'Invalid door appearance' }
    if (doorInput.doorPose !== undefined && !DOOR_POSES.includes(doorInput.doorPose as string)) return { success: false, error: 'Door position must be closed, ajar or open' }
    const styleError = doorStyleFieldError(doorInput)
    if (styleError) return { success: false, error: styleError }
    if (doorInput.doorType !== undefined && !isDoorType(doorInput.doorType)) {
      return { success: false, error: `Invalid doorType: ${String(doorInput.doorType)}. Must be one of the DoorType enum values.` }
    }

    const position = doorInput.position as LocalCoord | undefined
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      return { success: false, error: 'Door position must be a building-local LocalCoord ({x, y} meters)' }
    }

    const id = (doorInput.id as string) || genId('door')
    const owner = requestedRoomId
      ? { status: 'assigned' as const, roomId: requestedRoomId }
      : resolveUniqueRoomOwner(position, collectFloorRoomOwnershipPolygons(floor))
    let door: RoomDoor = {
      id,
      ...(owner.status === 'assigned' ? { roomId: owner.roomId, ownership: { status: 'assigned' as const } } : {}),
      ...(owner.status === 'unassigned' ? { ownership: { status: 'unassigned' as const } } : {}),
      ...(owner.status === 'ambiguous' ? { ownership: { status: 'ambiguous' as const, candidateRoomIds: owner.candidateRoomIds } } : {}),
      connectedToId: doorInput.connectedToId as string | undefined,
      connectedToType: (doorInput.connectedToType as RoomDoor['connectedToType']) ?? 'room',
      // R2.4: closed enum with 'opening' (wall opening) included.
      doorType: (doorInput.doorType as RoomDoor['doorType']) ?? 'standard',
      ...(doorInput.doorAppearance !== undefined ? { doorAppearance: doorInput.doorAppearance as RoomDoor['doorAppearance'] } : {}),
      ...(doorInput.doorPose !== undefined ? { doorPose: doorInput.doorPose as RoomDoor['doorPose'] } : {}),
      ...(doorInput.doorOperation !== undefined ? { doorOperation: doorInput.doorOperation as RoomDoor['doorOperation'] } : {}),
      ...(doorInput.hingeSide !== undefined ? { hingeSide: doorInput.hingeSide as RoomDoor['hingeSide'] } : {}),
      ...(doorInput.swingSide !== undefined ? { swingSide: doorInput.swingSide as RoomDoor['swingSide'] } : {}),
      ...(doorInput.assetPreset !== undefined ? { assetPreset: doorInput.assetPreset as string } : {}),
      ...(doorInput.material !== undefined ? { material: doorInput.material as RoomDoor['material'] } : {}),
      ...(doorInput.glass !== undefined ? { glass: doorInput.glass as RoomDoor['glass'] } : {}),
      position: { x: position.x, y: position.y },
      width: (doorInput.width as number) ?? 0.9,
      ...(doorInput.depth !== undefined ? { depth: doorInput.depth as number } : {}),
      ...(doorInput.rotation !== undefined ? { rotation: doorInput.rotation as number } : {}),
      ...(doorInput.geometry !== undefined ? { geometry: structuredClone(doorInput.geometry) as RoomDoor['geometry'] } : {}),
      ...(doorInput.name !== undefined ? { name: doorInput.name as string } : {}),
      ...(doorInput.routeConnection !== undefined ? { routeConnection: structuredClone(doorInput.routeConnection) as NonNullable<RoomDoor['routeConnection']> } : {}),
      metadata: (doorInput.metadata as Record<string, unknown>) ?? {},
      ...(doorInput.wallAttachment !== undefined ? { wallAttachment: structuredClone(doorInput.wallAttachment) as NonNullable<RoomDoor['wallAttachment']> } : {}),
    }
    const attached = validateDoorWallAttachment(floor, door)
    if (!attached.ok) return { success: false, error: attached.error }
    door = attached.door
    if (door.wallAttachment && !requestedRoomId) {
      const resolved = resolveUniqueRoomOwner(door.position, collectFloorRoomOwnershipPolygons(floor))
      delete door.roomId
      door.ownership = resolved.status === 'assigned' ? { status: 'assigned' } : resolved.status === 'ambiguous' ? { status: 'ambiguous', candidateRoomIds: resolved.candidateRoomIds } : { status: 'unassigned' }
      if (resolved.status === 'assigned') door.roomId = resolved.roomId
    }
    if (!floor.doors) floor.doors = []
    floor.doors.push(door)

    recordChange(document, { entityId: id, entityType: 'door', operation: 'created' })
    return { success: true, entityId: id, data: { id, buildingId, floorId, roomId: door.roomId } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const id = result.entityId ?? ((payload.door as Record<string, unknown> | undefined)?.id as string)
    return {
      id: 'door.delete',
      label: 'Undo Create Door',
      payload: { doorId: id },
    }
  },
}

export const doorUpdateHandler: CommandHandler = {
  id: 'door.update',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const doorId = payload.doorId as string
    const ctx = findFloorAndDoor(document, doorId)
    if (!ctx) return { success: false, error: 'Door not found: ' + doorId }
    const old = structuredClone(ctx.door)
    const oldNetwork = structuredClone(ctx.floor.routeNetwork)
    // Trusted history inverses restore exact imported snapshots, including
    // unresolved attachments/ownership; forward edits still validate below.
    if (payload.restoreDoor !== undefined) {
      const restored = structuredClone(payload.restoreDoor) as RoomDoor
      if (!restored || restored.id !== doorId) return { success: false, error: 'Door identity cannot change' }
      ctx.floor.doors![ctx.floor.doors!.findIndex(door => door.id === doorId)] = restored
      if ('restoreNetwork' in payload) {
        if (payload.restoreNetwork === undefined) delete ctx.floor.routeNetwork
        else ctx.floor.routeNetwork = structuredClone(payload.restoreNetwork) as RouteNetwork
      }
      recordChange(document, { entityId: doorId, entityType: 'door', operation: 'updated' })
      return { success: true, entityId: doorId, data: { old, oldNetwork } }
    }
    const patch = (payload.patch as Record<string, unknown>) ?? {}
    if (patch.doorAppearance !== undefined && !DOOR_APPEARANCES.includes(patch.doorAppearance as string)) return { success: false, error: 'Invalid door appearance' }
    if (patch.doorPose !== undefined && !DOOR_POSES.includes(patch.doorPose as string)) return { success: false, error: 'Door position must be closed, ajar or open' }
    const patchStyleError = doorStyleFieldError(patch)
    if (patchStyleError) return { success: false, error: patchStyleError }
    // Cosmetic edits must not normalize imported physical geometry or move
    // route anchors. The existing inverse carries the exact prior snapshots.
    const cosmeticKeys: readonly string[] = COSMETIC_DOOR_KEYS
    if (payload.restoreDoor === undefined && Object.keys(patch).length > 0 && Object.keys(patch).every(key => cosmeticKeys.includes(key))) {
      const next = structuredClone(ctx.door) as unknown as Record<string, unknown>
      for (const key of COSMETIC_DOOR_KEYS) {
        if (!(key in patch)) continue
        if (patch[key] === undefined) delete next[key]
        else next[key] = patch[key]
      }
      ctx.floor.doors![ctx.floor.doors!.findIndex(door => door.id === doorId)] = next as unknown as RoomDoor
      recordChange(document, { entityId: doorId, entityType: 'door', operation: 'updated' })
      return { success: true, entityId: doorId, data: { old, oldNetwork } }
    }
    if ('depth' in patch && (typeof patch.depth !== 'number' || !Number.isFinite(patch.depth) || patch.depth <= 0)) return { success: false, error: 'Door depth must be a positive finite number' }
    if ('roomId' in patch && patch.roomId !== undefined && !isKnownRoomId(ctx.floor, patch.roomId as string)) return { success: false, error: 'Room not found: ' + patch.roomId }
    if (patch.doorType !== undefined && !isDoorType(patch.doorType)) return { success: false, error: 'Invalid doorType: ' + patch.doorType }
    let next = structuredClone(ctx.door)
    const allowed = ['position','width','depth','rotation','geometry','name','doorType','doorAppearance','doorPose','doorOperation','hingeSide','swingSide','assetPreset','material','glass','connectedToId','connectedToType','routeConnection','roomId','ownership','wallAttachment'] as const
    for (const key of allowed) {
      if (key in patch) (next as unknown as Record<string, unknown>)[key] = structuredClone(patch[key])
    }
    if (payload.restoreDoor !== undefined) next = structuredClone(payload.restoreDoor) as RoomDoor
    if (next.id !== doorId) return { success: false, error: 'Door identity cannot change' }
    if (!Number.isFinite(next.position?.x) || !Number.isFinite(next.position?.y) || !Number.isFinite(next.width) || next.width <= 0) return { success: false, error: 'Door position and width must be finite and width must be positive' }
    if (payload.snapToWall === true) {
      const chosen = findPlacementWall(ctx.floor.walls ?? [], next.position)
      if (!chosen.ok) return { success: false, error: chosen.reason }
      next.wallAttachment = { wallId: chosen.wall.id, offset: computeOffsetFromPosition(next.position, chosen.wall), openingHeight: next.wallAttachment?.openingHeight ?? Math.min(2.1, chosen.wall.height) }
    } else if (next.wallAttachment && patch.position !== undefined && !('wallAttachment' in patch) && payload.restoreDoor === undefined) {
      const host = ctx.floor.walls?.find(wall => wall.id === next.wallAttachment!.wallId)
      if (!host) return { success: false, error: 'Host wall is missing' }
      next.wallAttachment = { ...next.wallAttachment, offset: computeOffsetFromPosition(next.position,host) }
    }
    const attached = validateDoorWallAttachment(ctx.floor,next)
    if (!attached.ok) return { success: false, error: attached.error }
    if (payload.restoreDoor === undefined) next = attached.door
    if (payload.restoreDoor === undefined) {
      if ('roomId' in patch) next.ownership = next.roomId ? { status: 'assigned' } : { status: 'unassigned' }
      else if (payload.snapToWall === true || (!next.wallAttachment && (patch.position != null || patch.geometry != null))) {
        const owner = resolveUniqueRoomOwner(next.position,collectFloorRoomOwnershipPolygons(ctx.floor))
        next.roomId = owner.status === 'assigned' ? owner.roomId : undefined
        next.ownership = owner.status === 'assigned' ? { status:'assigned' } : owner.status === 'ambiguous' ? {status:'ambiguous',candidateRoomIds:owner.candidateRoomIds} : {status:'unassigned'}
      }
    }
    const network = structuredClone(ctx.floor.routeNetwork)
    const anchor = next.routeConnection && network?.nodes.find(node => node.id === next.routeConnection!.anchorNodeId)
    if (anchor && network) {
      if (next.routeConnectionManaged) {
        const target = network.nodes.find(n => n.id === next.routeConnection!.targetRouteNodeId)
        if (!target) return { success: false, error: 'Reconnect this door before moving it.' }
        const own = next.wallAttachment ? undefined : ownWallOf(next, ctx.floor)
        const problem = floorConnectionProblem({key:`door:${doorId}`,kind:'door',id:doorId,label:next.name ?? 'Door',position:next.position,hostWallId:next.wallAttachment?.wallId,...(own?{ownWallId:own.id,ownWallReach:own.reach}:{})},target.position,ctx.floor)
        if (problem) return { success: false, error: problem }
      }
      anchor.position = { ...next.position }
      for (const edge of network.edges) {
        if (edge.from !== anchor.id && edge.to !== anchor.id) continue
        const a=network.nodes.find(node=>node.id===edge.from),b=network.nodes.find(node=>node.id===edge.to)
        if(a&&b)edge.distance=Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y)
      }
    }
    const index=ctx.floor.doors!.findIndex(door=>door.id===doorId)
    ctx.floor.doors![index]=next
    if ('restoreNetwork' in payload) {
      if (payload.restoreNetwork === undefined) delete ctx.floor.routeNetwork
      else ctx.floor.routeNetwork=structuredClone(payload.restoreNetwork) as RouteNetwork
    } else if (network) ctx.floor.routeNetwork=network
    recordChange(document,{entityId:doorId,entityType:'door',operation:'updated'})
    return {success:true,entityId:doorId,data:{old,oldNetwork}}
  },
  inverse(payload:Record<string,unknown>,result:MutationResult):Command|null {
    if (!result.data?.old) return null
    return {id:'door.update',label:'Undo Door Update',payload:{doorId:payload.doorId,restoreDoor:result.data.old,restoreNetwork:result.data.oldNetwork}}
  },
}

/** Look fields that apply-to-similar may copy. Hinge and swing are left out of the panel's default because they depend on each door's spot. */
export const SIMILAR_DOOR_FIELDS = ['assetPreset', 'material', 'glass', 'doorAppearance', 'doorOperation', 'doorPose', 'hingeSide', 'swingSide'] as const
type SimilarDoorField = typeof SIMILAR_DOOR_FIELDS[number]

/** Doors on the same floor with the same effective operation and |width - source width| <= 0.1 m (source excluded). */
export function findSimilarDoors(floor: { doors?: RoomDoor[] }, sourceDoorId: string): RoomDoor[] {
  const doors = floor.doors ?? []
  const source = doors.find(door => door.id === sourceDoorId)
  if (!source) return []
  const operation = resolveDoorStyle(source).operation
  return doors.filter(door => door.id !== sourceDoorId && resolveDoorStyle(door).operation === operation && Math.abs(door.width - source.width) <= 0.1 + 1e-9)
}

/**
 * Copy look fields from one door to every similar door on its floor, as one undoable command.
 * All-or-nothing: any refusal leaves the document untouched (and so no history entry).
 * The inverse restores every target's exact prior record.
 */
export const doorApplyAppearanceToSimilarHandler: CommandHandler = {
  id: 'door.applyAppearanceToSimilar',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const floor = document.buildings.find(b => b.id === payload.buildingId)?.floors.find(f => f.id === payload.floorId)
    if (!floor) return { success: false, error: 'Floor not found' }
    if (floor.locked) return { success: false, error: 'This floor is locked; nothing was changed.' }
    if (Array.isArray(payload.restoreDoors)) {
      const restores = payload.restoreDoors as RoomDoor[]
      if (!restores.every(door => floor.doors?.some(other => other.id === door.id))) return { success: false, error: 'A door to restore is missing' }
      const old = restores.map(door => structuredClone(floor.doors!.find(other => other.id === door.id)!))
      for (const door of restores) floor.doors![floor.doors!.findIndex(other => other.id === door.id)] = structuredClone(door)
      for (const door of restores) recordChange(document, { entityId: door.id, entityType: 'door', operation: 'updated' })
      return { success: true, entityId: payload.sourceDoorId as string, data: { old, count: restores.length } }
    }
    const fields = payload.fields as unknown
    if (!Array.isArray(fields) || fields.length === 0 || !fields.every(field => (SIMILAR_DOOR_FIELDS as readonly string[]).includes(field))) return { success: false, error: 'Only door look fields can be applied to similar doors' }
    const source = floor.doors?.find(door => door.id === payload.sourceDoorId)
    if (!source) return { success: false, error: 'Door not found: ' + String(payload.sourceDoorId) }
    const values: Partial<Record<SimilarDoorField, unknown>> = {}
    for (const field of fields as SimilarDoorField[]) values[field] = (source as unknown as Record<string, unknown>)[field]
    const invalid = doorStyleFieldError(values)
      ?? (values.doorAppearance !== undefined && !DOOR_APPEARANCES.includes(values.doorAppearance as string) ? 'Invalid door appearance' : undefined)
      ?? (values.doorPose !== undefined && !DOOR_POSES.includes(values.doorPose as string) ? 'Door position must be closed, ajar or open' : undefined)
    if (invalid) return { success: false, error: invalid }
    const targets = findSimilarDoors(floor, source.id)
    if (targets.length === 0) return { success: false, error: 'No similar doors on this floor' }
    const old = targets.map(door => structuredClone(door))
    const next = targets.map(door => {
      const record = structuredClone(door) as unknown as Record<string, unknown>
      for (const [key, value] of Object.entries(values)) { if (value === undefined) delete record[key]; else record[key] = structuredClone(value) }
      return record as unknown as RoomDoor
    })
    // Every check is done; now apply all at once.
    for (const door of next) floor.doors![floor.doors!.findIndex(other => other.id === door.id)] = door
    for (const door of next) recordChange(document, { entityId: door.id, entityType: 'door', operation: 'updated' })
    return { success: true, entityId: source.id, data: { old, count: next.length } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    if (!result.success || !Array.isArray(result.data?.old)) return null
    return { id: 'door.applyAppearanceToSimilar', label: 'Undo Apply To Similar Doors', payload: { buildingId: payload.buildingId, floorId: payload.floorId, sourceDoorId: payload.sourceDoorId, restoreDoors: result.data.old } }
  },
}

export const doorDeleteHandler: CommandHandler = {
  id: 'door.delete',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const doorId = payload.doorId as string
    const ctx = findFloorAndDoor(document, doorId)
    if (!ctx) return { success: false, error: `Door not found: ${doorId}` }

    const oldDoor = structuredClone(ctx.door)
    const oldNetwork = { present: Object.hasOwn(ctx.floor, 'routeNetwork'), value: structuredClone(ctx.floor.routeNetwork) }
    const oldIndex = ctx.floor.doors!.findIndex(d => d.id === doorId)
    ctx.floor.doors = ctx.floor.doors!.filter(d => d.id !== doorId)
    if (oldDoor.routeConnection) removeFeatureRoutePort(ctx.floor, oldDoor.routeConnection, ctx.building)

    recordChange(document, { entityId: doorId, entityType: 'door', operation: 'deleted' })
    return {
      success: true,
      entityId: doorId,
      data: { oldDoor, oldNetwork, oldIndex, buildingId: ctx.building.id, floorId: ctx.floor.id, roomId: ctx.door.roomId },
    }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const oldDoor = result.data?.oldDoor as RoomDoor | undefined
    if (!oldDoor) return null
    return {
      id: 'door.create',
      label: 'Undo Delete Door',
      payload: {
        restoreDoor: structuredClone(oldDoor),
        restoreIndex: result.data?.oldIndex,
        restoreNetwork: result.data?.oldNetwork,
        buildingId: result.data?.buildingId as string,
        floorId: result.data?.floorId as string,
        roomId: oldDoor.roomId,
        door: {
          id: oldDoor.id,
          position: oldDoor.position,
          width: oldDoor.width,
          doorType: oldDoor.doorType,
          ...(oldDoor.depth !== undefined ? { depth: oldDoor.depth } : {}),
          ...(oldDoor.rotation !== undefined ? { rotation: oldDoor.rotation } : {}),
          ...(oldDoor.geometry !== undefined ? { geometry: oldDoor.geometry } : {}),
          ...(oldDoor.name !== undefined ? { name: oldDoor.name } : {}),
          ...(oldDoor.wallAttachment !== undefined ? { wallAttachment: oldDoor.wallAttachment } : {}),
          ...(oldDoor.routeConnection !== undefined ? { routeConnection: oldDoor.routeConnection } : {}),
          ...(oldDoor.connectedToId !== undefined ? { connectedToId: oldDoor.connectedToId } : {}),
          connectedToType: oldDoor.connectedToType,
          metadata: oldDoor.metadata,
        },
      },
    }
  },
}

export const doorDuplicateHandler: CommandHandler = {
  id: 'door.duplicate',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const doorId = payload.doorId as string
    const ctx = findFloorAndDoor(document, doorId)
    if (!ctx) return { success: false, error: `Door not found: ${doorId}` }

    let offset: LocalCoord = { x: 0.5, y: 0.5 }
    if (payload.offset !== undefined) {
      const supplied = payload.offset as { x?: unknown; y?: unknown } | null
      if (!supplied
        || typeof supplied.x !== 'number' || typeof supplied.y !== 'number'
        || !Number.isFinite(supplied.x) || !Number.isFinite(supplied.y)) {
        return { success: false, error: 'Door duplicate offset must be a building-local LocalCoord ({x, y} meters)' }
      }
      offset = { x: supplied.x, y: supplied.y }
    }

    const id = genId('door')
    // Locked decisions: the duplicate never inherits route connectivity,
    // graph identity, or the other-side reference; room ownership is
    // re-evaluated by containment at the new position (same resolution
    // as door.create).
    const placed = placeDuplicatedDoor(ctx.floor, ctx.door, buildDuplicatedDoor(ctx.door, id, offset), payload.offset !== undefined ? offset : undefined)
    if (!placed.ok) return { success: false, error: placed.error }
    const duplicate = placed.door
    const owner = resolveUniqueRoomOwner(duplicate.position, collectFloorRoomOwnershipPolygons(ctx.floor))
    if (owner.status === 'assigned') {
      duplicate.roomId = owner.roomId
      duplicate.ownership = { status: 'assigned' }
    } else if (owner.status === 'ambiguous') {
      duplicate.ownership = { status: 'ambiguous', candidateRoomIds: owner.candidateRoomIds }
    } else {
      duplicate.ownership = { status: 'unassigned' }
    }
    if (!ctx.floor.doors) ctx.floor.doors = []
    ctx.floor.doors.push(duplicate)

    recordChange(document, { entityId: id, entityType: 'door', operation: 'created' })
    return { success: true, entityId: id, data: { buildingId: ctx.building.id, floorId: ctx.floor.id, roomId: duplicate.roomId } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    if (!result.entityId) return null
    return {
      id: 'door.delete',
      label: 'Undo Duplicate Door',
      payload: { doorId: result.entityId },
    }
  },
}

/** Create the Door-owned portal node and only the explicitly requested connector. */
export const doorRouteConnectHandler: CommandHandler = {
  id: 'door.route.connect',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const doorId = payload.doorId as string
    const ctx = findFloorAndDoor(document, doorId)
    if (!ctx) return { success: false, error: `Door not found: ${doorId}` }
    if (payload.restore === true) {
      ctx.floor.routeNetwork = payload.network === undefined ? undefined : structuredClone(payload.network) as RouteNetwork
      ctx.door.routeConnection = payload.routeConnection === undefined ? undefined : structuredClone(payload.routeConnection) as NonNullable<RoomDoor['routeConnection']>
      recordChange(document, { entityId: doorId, entityType: 'door', operation: 'updated' })
      return { success: true, entityId: doorId }
    }

    const segment = payload.segment as { edgeId?: string; position?: { x?: unknown; y?: unknown } } | undefined
    const requestedNodeId = payload.routeNodeId as string | undefined

    if (!segment && !requestedNodeId) {
      return { success: false, error: 'door.route.connect requires routeNodeId or segment' }
    }
    if (segment) {
      const position = segment.position
      if (typeof segment.edgeId !== 'string' || !position
        || typeof position.x !== 'number' || typeof position.y !== 'number'
        || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
        return { success: false, error: 'segment must contain an edgeId and finite position' }
      }
      const edge = ctx.floor.routeNetwork?.edges.find(candidate => candidate.id === segment.edgeId)
      if (!edge) return { success: false, error: `Route edge not found: ${segment.edgeId}` }
      if (collectDoorConnectorEdgeIds(document).has(segment.edgeId)) {
        return { success: false, error: `Route edge ${segment.edgeId} is a door connector and cannot be a junction target` }
      }
    }
    if (requestedNodeId && !ctx.floor.routeNetwork?.nodes.some(node => node.id === requestedNodeId)) {
      return { success: false, error: `Route node not found: ${requestedNodeId}` }
    }
    const oldNetwork = structuredClone(ctx.floor.routeNetwork)
    const oldRouteConnection = ctx.door.routeConnection ? structuredClone(ctx.door.routeConnection) : undefined
    const network = ctx.floor.routeNetwork!
    if (ctx.door.routeConnection) {
      // Remove EVERY edge incident to the anchor, not just the recorded
      // connector id. A stale record must never leave a half-edge referencing
      // a removed node (that would make the network INVALID).
      const staleAnchorNodeId = ctx.door.routeConnection.anchorNodeId
      network.nodes = network.nodes.filter(node => node.id !== staleAnchorNodeId)
      network.edges = network.edges.filter(edge => edge.from !== staleAnchorNodeId && edge.to !== staleAnchorNodeId)
    }

    let resolvedTargetId = requestedNodeId ?? ''
    if (segment) {
      const split = applyRouteJunctionSplit(
        network,
        segment.edgeId as string,
        { x: segment.position!.x as number, y: segment.position!.y as number },
        ctx.floor.level,
      )
      if (!split.ok) {
        ctx.floor.routeNetwork = oldNetwork
        ctx.door.routeConnection = oldRouteConnection
        return { success: false, error: split.error }
      }
      resolvedTargetId = split.junctionId
      if (!split.reusedEndpoint) {
        recordChange(document, { entityId: split.removedEdgeId, entityType: 'route-edge', operation: 'deleted' })
        recordChange(document, { entityId: split.junctionId, entityType: 'route-node', operation: 'created' })
        for (const createdEdgeId of split.createdEdgeIds) {
          recordChange(document, { entityId: createdEdgeId, entityType: 'route-edge', operation: 'created' })
        }
      }
    }

    const resolvedTarget = network.nodes.find(node => node.id === resolvedTargetId)
    if (!resolvedTarget) {
      ctx.floor.routeNetwork = oldNetwork
      ctx.door.routeConnection = oldRouteConnection
      return { success: false, error: `Resolved route target not found: ${resolvedTargetId}` }
    }

    const anchorNodeId = genId('route-node')
    const connectorEdgeId = genId('route-edge')
    network.nodes.push({ id: anchorNodeId, type: 'portal', position: { ...ctx.door.position }, floor: ctx.floor.level })
    network.edges.push({
      id: connectorEdgeId,
      from: anchorNodeId,
      to: resolvedTargetId,
      type: 'walk',
      distance: Math.hypot(resolvedTarget.position.x - ctx.door.position.x, resolvedTarget.position.y - ctx.door.position.y),
    })
    ctx.door.routeConnection = { anchorNodeId, targetRouteNodeId: resolvedTargetId, connectorEdgeId }
    recordChange(document, { entityId: anchorNodeId, entityType: 'route-node', operation: 'created' })
    recordChange(document, { entityId: connectorEdgeId, entityType: 'route-edge', operation: 'created' })
    recordChange(document, { entityId: doorId, entityType: 'door', operation: 'updated' })
    return { success: true, entityId: doorId, data: { oldNetwork, oldRouteConnection } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    if (!result.data) return null
    return { id: 'door.route.connect', label: 'Undo Door Route Connection', payload: { doorId: payload.doorId, restore: true, network: result.data.oldNetwork, routeConnection: result.data.oldRouteConnection } }
  },
}

const REJOIN_COLLINEAR_EPSILON_METERS = 1e-6

/** Rejoin the two halves of a split edge when the junction is orphaned and geometrically redundant. */
function rejoinOrphanedJunction(network: RouteNetwork, junctionId: string): string | null {
  const incident = network.edges.filter(edge => edge.from === junctionId || edge.to === junctionId)
  if (incident.length !== 2) return null
  const [first, second] = incident
  const neighborA = first.from === junctionId ? first.to : first.from
  const neighborB = second.from === junctionId ? second.to : second.from
  if (neighborA === neighborB) return null
  const nodeA = network.nodes.find(node => node.id === neighborA)
  const nodeB = network.nodes.find(node => node.id === neighborB)
  const junction = network.nodes.find(node => node.id === junctionId)
  if (!nodeA || !nodeB || !junction) return null
  const length = Math.hypot(nodeB.position.x - nodeA.position.x, nodeB.position.y - nodeA.position.y)
  if (length < REJOIN_COLLINEAR_EPSILON_METERS) return null
  const perpendicularDistance = Math.abs(
    (nodeB.position.x - nodeA.position.x) * (junction.position.y - nodeA.position.y)
    - (nodeB.position.y - nodeA.position.y) * (junction.position.x - nodeA.position.x),
  ) / length
  if (perpendicularDistance > REJOIN_COLLINEAR_EPSILON_METERS) return null
  const mergedEdgeId = genId('route-edge')
  network.edges = network.edges.filter(edge => edge.id !== first.id && edge.id !== second.id)
  network.nodes = network.nodes.filter(node => node.id !== junctionId)
  network.edges.push({
    id: mergedEdgeId,
    from: neighborA,
    to: neighborB,
    type: first.type === second.type ? first.type : 'walk',
    distance: length,
  })
  return mergedEdgeId
}

/** Remove the Door-owned anchor + connector; keep or rejoin the junction by reference count. */
export const doorRouteDisconnectHandler: CommandHandler = {
  id: 'door.route.disconnect',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const doorId = payload.doorId as string
    const ctx = findFloorAndDoor(document, doorId)
    if (!ctx) return { success: false, error: `Door not found: ${doorId}` }

    if (payload.restore === true) {
      ctx.floor.routeNetwork = payload.network === undefined ? undefined : structuredClone(payload.network) as RouteNetwork
      if (payload.routeConnection === undefined) delete ctx.door.routeConnection
      else ctx.door.routeConnection = structuredClone(payload.routeConnection) as NonNullable<RoomDoor['routeConnection']>
      recordChange(document, { entityId: doorId, entityType: 'door', operation: 'updated' })
      return { success: true, entityId: doorId }
    }

    const connection = ctx.door.routeConnection
    if (!connection) return { success: false, error: `Door has no route connection: ${doorId}` }
    const network = ctx.floor.routeNetwork
    if (!network) return { success: false, error: `Floor has no route network: ${doorId}` }
    const oldNetwork = structuredClone(network)
    const oldRouteConnection = structuredClone(connection)

    // Remove EVERY edge incident to the anchor, not just the recorded
    // connector id: a stale connectorEdgeId must never leave a half-edge
    // referencing the removed anchor node.
    network.nodes = network.nodes.filter(node => node.id !== connection.anchorNodeId)
    network.edges = network.edges.filter(edge => edge.from !== connection.anchorNodeId && edge.to !== connection.anchorNodeId)
    // Drop this door's link first: the reference check counts door route ports,
    // and the door being disconnected must not keep its own junction alive.
    delete ctx.door.routeConnection
    if (!isRouteNodeReferencedByAccessRelationships(document, ctx.building.id, ctx.floor.id, connection.targetRouteNodeId)) {
      const mergedEdgeId = rejoinOrphanedJunction(network, connection.targetRouteNodeId)
      if (mergedEdgeId) {
        recordChange(document, { entityId: mergedEdgeId, entityType: 'route-edge', operation: 'created' })
      }
    }

    recordChange(document, { entityId: doorId, entityType: 'door', operation: 'updated' })
    return { success: true, entityId: doorId, data: { oldNetwork, oldRouteConnection } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    if (!result.data) return null
    return {
      id: 'door.route.disconnect',
      label: 'Undo Door Route Disconnect',
      payload: { doorId: result.entityId, restore: true, network: result.data.oldNetwork, routeConnection: result.data.oldRouteConnection },
    }
  },
}

function findFeature(document: CampusDocument, featureId: string) {
  for (const bld of document.buildings) {
    if (bld.staircases) {
      const st = bld.staircases.find(s => s.id === featureId || featureId.startsWith(`${s.id}-`))
      if (st) return { building: bld, feature: st, featureType: 'staircase' as const }
    }
    if (bld.elevators) {
      const el = bld.elevators.find(e => e.id === featureId || featureId.startsWith(`${e.id}-`))
      if (el) return { building: bld, feature: el, featureType: 'elevator' as const }
    }
    for (const fl of bld.floors) {
      const st = fl.staircases?.find((s: any) => s.id === featureId || featureId.startsWith(`${s.id}-`))
      if (st) {
        return {
          building: bld,
          feature: {
            id: st.id,
            buildingId: bld.id,
            name: st.name,
            type: st.type ?? 'open',
            accessible: false,
            fromLevel: st.fromLevel ?? fl.level,
            toLevel: st.toLevel ?? fl.level + 1,
            levels: { [fl.level]: { position: st.position, rotation: 0 } },
          } as Staircase,
          featureType: 'staircase' as const,
        }
      }
      const el = fl.elevators?.find((e: any) => e.id === featureId || featureId.startsWith(`${e.id}-`))
      if (el) {
        return {
          building: bld,
          feature: {
            id: el.id,
            buildingId: bld.id,
            name: el.name,
            type: 'passenger',
            accessible: false,
            fromLevel: el.fromLevel ?? fl.level,
            toLevel: el.toLevel ?? fl.level,
            levels: { [fl.level]: { position: el.position, rotation: 0 } },
          } as Elevator,
          featureType: 'elevator' as const,
        }
      }
    }
  }
  return null
}

function restoreFeatureTransitions(
  building: CampusDocument['buildings'][number],
  transitions: VerticalTransition[] | undefined,
): void {
  if (!transitions || transitions.length === 0) return
  const restoredIds = new Set(transitions.map(transition => transition.id))
  building.verticalTransitions = [
    ...(building.verticalTransitions ?? []).filter(transition => !restoredIds.has(transition.id)),
    ...JSON.parse(JSON.stringify(transitions)) as VerticalTransition[],
  ]
}


export const featureCreateHandler: CommandHandler = {
  id: 'feature.create',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const buildingId = payload.buildingId as string
    const featureType = (payload.featureType as 'staircase' | 'elevator') ?? 'staircase'
    const floor = (payload.floor as number) ?? 0

    const building = document.buildings.find(b => b.id === buildingId)
    if (!building) return { success: false, error: `Building not found: ${buildingId}` }

    const id = (payload.id as string) || genId(featureType === 'staircase' ? 'stair' : 'elev')
    const name = (payload.name as string) || (featureType === 'staircase' ? 'Staircase' : 'Elevator')
    const position = (payload.position as LocalCoord) ?? { x: 0, y: 0 }
    const rotation = (payload.rotation as number) ?? 0
    const fromLevel = (payload.fromLevel as number) ?? floor
    // A stair or lift is drawn on one floor (2026-11-08); floors connect through links, not a range.
    const toLevel = (payload.toLevel as number) ?? floor
    const accessible = (payload.accessible as boolean) ?? false

    const drawing = payload.drawing as { definitionId: 'stair' | 'elevator'; properties: Record<string, unknown> } | undefined
    const polygon = payload.polygon as LocalPolygon | undefined
    const landing = payload.landing as { position: LocalCoord; rotation?: number; polygon?: LocalPolygon } | undefined

    const levelGeom: any = {
      position,
      rotation,
      ...(drawing ? { drawing } : {}),
      ...(polygon ? { polygon } : {}),
      ...(landing ? { landing } : {}),
    }

    if (featureType === 'staircase') {
      const type = (payload.type as StaircaseType) ?? 'standard'
      const feature: Staircase = {
        id,
        buildingId,
        name,
        type,
        accessible,
        fromLevel,
        toLevel,
        levels: { [floor]: levelGeom },
      }
      // Resolve geometry if drawing is present
      const resolved = resolveLevelGeometry(feature, floor)
      if (resolved.polygon) levelGeom.polygon = resolved.polygon
      if (resolved.landing) levelGeom.landing = resolved.landing

      if (!building.staircases) building.staircases = []
      building.staircases.push(feature)
      restoreFeatureTransitions(building, payload.verticalTransitions as VerticalTransition[] | undefined)
      // Placed: connect to the nearest free staircase on the floor below / above.
      autoLinkFeature(building, 'staircase', id)
      recordChange(document, { entityId: id, entityType: 'staircase', operation: 'created' })
      return { success: true, entityId: id, data: { feature, buildingId } }
    } else {
      const type = (payload.type as ElevatorType) ?? 'passenger'
      const feature: Elevator = {
        id,
        buildingId,
        name,
        type,
        accessible,
        fromLevel,
        toLevel,
        levels: { [floor]: levelGeom },
      }
      const resolved = resolveLevelGeometry(feature, floor)
      if (resolved.polygon) levelGeom.polygon = resolved.polygon
      if (resolved.landing) levelGeom.landing = resolved.landing

      if (!building.elevators) building.elevators = []
      building.elevators.push(feature)
      restoreFeatureTransitions(building, payload.verticalTransitions as VerticalTransition[] | undefined)
      // Placed: connect to the nearest free elevator on the floor below / above.
      autoLinkFeature(building, 'elevator', id)
      recordChange(document, { entityId: id, entityType: 'elevator', operation: 'created' })
      return { success: true, entityId: id, data: { feature, buildingId } }
    }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const id = result.entityId ?? (payload.id as string)
    return {
      id: 'feature.delete',
      label: 'Undo Create Feature',
      payload: { featureId: id },
    }
  },
}

export const featureUpdateHandler: CommandHandler = {
  id: 'feature.update',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const featureId = payload.featureId as string
    const level = (payload.level as number) ?? 0
    const patch = (payload.patch as Record<string, unknown>) ?? {}

    const ctx = findFeature(document, featureId)
    if (!ctx) return { success: false, error: `Feature not found: ${featureId}` }

    const { feature, featureType } = ctx
    let levelGeom = feature.levels[level]
    const oldLevelGeom = levelGeom ? JSON.parse(JSON.stringify(levelGeom)) : null
    const oldFeatureProperties = { name: feature.name, fromLevel: feature.fromLevel, toLevel: feature.toLevel }
    const oldFeatureRouteNetwork=featureRouteNetworkSnapshot(ctx.building,level)

    // Internal history restores the exact prior snapshot, including absent optional
    // fields and imported cache geometry; never run forward resizing on an inverse.
    if (Object.prototype.hasOwnProperty.call(payload, 'restoreLevelGeometry')) {
      if (payload.restoreLevelGeometry === null) delete feature.levels[level]
      else feature.levels[level] = structuredClone(payload.restoreLevelGeometry) as typeof levelGeom
      const properties = payload.restoreFeatureProperties as typeof oldFeatureProperties | undefined
      if (properties) Object.assign(feature, properties)
      if ('restoreFeatureRouteNetwork' in payload) restoreFeatureRouteNetwork(ctx.building,level,payload.restoreFeatureRouteNetwork as ReturnType<typeof featureRouteNetworkSnapshot>)
      recordChange(document, { entityId: featureId, entityType: featureType, operation: 'updated' })
      return { success: true, entityId: featureId, data: { oldLevelGeom, oldFeatureProperties } }
    }
    if ('height' in patch && (featureType !== 'staircase' || (patch.height !== null && (typeof patch.height !== 'number' || !Number.isFinite(patch.height) || patch.height <= 0)))) {
      return { success: false, error: 'Stair rise must be positive finite meters, or use floor height.' }
    }
    if ('rotation' in patch && (typeof patch.rotation !== 'number' || !Number.isFinite(patch.rotation))) return { success: false, error: 'Rotation must be finite degrees.' }
    let resized: typeof levelGeom | undefined
    if ('width' in patch || 'depth' in patch || ('rotation' in patch && !patch.polygon && !patch.drawing)) {
      if (!levelGeom) return { success: false, error: 'Feature level geometry is missing.' }
      const size = featureDimensions(levelGeom)
      try {
        resized = resizeFeatureGeometry(levelGeom, ('width' in patch ? patch.width : size?.width) as number, ('depth' in patch ? patch.depth : size?.depth) as number, (patch.rotation ?? levelGeom.rotation) as number)
      } catch (error) { return { success: false, error: (error as Error).message } }
    }

    if (!levelGeom) {
      levelGeom = { position: { x: 0, y: 0 }, rotation: 0 }
      feature.levels[level] = levelGeom
    }
    if (resized) { levelGeom = resized; feature.levels[level] = resized }
    if ('height' in patch && featureType === 'staircase') {
      if (patch.height === null) delete (levelGeom as import('@navi/core').StairLevelGeometry).height
      else (levelGeom as import('@navi/core').StairLevelGeometry).height = patch.height as number
    }

    if (patch.name != null) (feature as any).name = patch.name as string
    if (patch.fromLevel != null) (feature as any).fromLevel = patch.fromLevel as number
    if (patch.toLevel != null) (feature as any).toLevel = patch.toLevel as number
    if (patch.position) levelGeom.position = { ...(patch.position as LocalCoord) }
    if (patch.rotation != null) levelGeom.rotation = patch.rotation as number
    if (patch.landing) levelGeom.landing = { ...(patch.landing as any) }


    if (levelGeom.drawing && (patch.drawing || resized)) {
      const drawPatch = patch.drawing as any
      if (drawPatch?.properties) {
        levelGeom.drawing.properties = {
          ...levelGeom.drawing.properties,
          ...drawPatch.properties,
        }
      }
      const resolved = resolveLevelGeometry(feature, level)
      if (resolved.polygon) levelGeom.polygon = resolved.polygon
      if (resolved.landing) levelGeom.landing = resolved.landing
    } else if (patch.polygon) {
      levelGeom.polygon = { ...(patch.polygon as LocalPolygon) }
    }

    const portError=syncFeatureRoutePort(ctx.building,feature,level)
    if(portError){if(oldLevelGeom)feature.levels[level]=oldLevelGeom;else delete feature.levels[level];Object.assign(feature,oldFeatureProperties);restoreFeatureRouteNetwork(ctx.building,level,oldFeatureRouteNetwork);return {success:false,error:portError}}
    recordChange(document, { entityId: featureId, entityType: featureType as string, operation: 'updated' })
    return { success: true, entityId: featureId, data: { featureId, level, oldLevelGeom, oldFeatureProperties,oldFeatureRouteNetwork } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const featureId = payload.featureId as string
    const level = payload.level as number
    const oldLevelGeom = result.data?.oldLevelGeom
    if (!Object.prototype.hasOwnProperty.call(result.data ?? {}, 'oldLevelGeom')) return null
    const oldFeatureProperties = result.data?.oldFeatureProperties as { name?: string; fromLevel?: number; toLevel?: number } | undefined
    return {
      id: 'feature.update',
      label: 'Undo Feature Update',
      payload: { featureId, level, restoreLevelGeometry: oldLevelGeom, restoreFeatureProperties: oldFeatureProperties,restoreFeatureRouteNetwork:result.data?.oldFeatureRouteNetwork },
    }
  },
}

export const featureModeTransitionHandler: CommandHandler = {
  id: 'feature.modeTransition',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const featureId = payload.featureId as string
    const level = (payload.level as number) ?? 0
    const mode = payload.mode as 'freeform' | 'parametric'

    const ctx = findFeature(document, featureId)
    if (!ctx) return { success: false, error: `Feature not found: ${featureId}` }

    const { feature, featureType } = ctx
    const levelGeom = feature.levels[level]
    if (!levelGeom) return { success: false, error: `Level ${level} not found on feature ${featureId}` }

    const oldLevelGeom = JSON.parse(JSON.stringify(levelGeom))

    if (mode === 'freeform') {
      const resolved = resolveLevelGeometry(feature, level)
      delete levelGeom.drawing
      if (resolved.polygon) levelGeom.polygon = resolved.polygon
    } else {
      const defId = featureType === 'staircase' ? 'stair' : 'elevator'
      const defaultProperties = featureType === 'staircase'
        ? { stepCount: 10, stepWidth: 1.2, stepDepth: 0.3, direction: 'up', preset: 'straight' }
        : { width: 2.0, depth: 2.0, doorSide: 'front' }

      levelGeom.drawing = {
        definitionId: defId,
        properties: (payload.properties as Record<string, unknown>) ?? defaultProperties,
      }
      const resolved = resolveLevelGeometry(feature, level)
      if (resolved.polygon) levelGeom.polygon = resolved.polygon
    }

    recordChange(document, { entityId: featureId, entityType: featureType as string, operation: 'updated' })
    return { success: true, entityId: featureId, data: { featureId, level, oldLevelGeom } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const featureId = payload.featureId as string
    const level = payload.level as number
    const oldLevelGeom = result.data?.oldLevelGeom
    if (!oldLevelGeom) return null
    return {
      id: 'feature.update',
      label: 'Undo Mode Transition',
      payload: { featureId, level, patch: oldLevelGeom },
    }
  },
}

export const featureDeleteHandler: CommandHandler = {
  id: 'feature.delete',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const featureId = payload.featureId as string
    const ctx = findFeature(document, featureId)
    if (!ctx) return { success: false, error: `Feature not found: ${featureId}` }

    const { building, feature, featureType } = ctx
    const oldFeature = JSON.parse(JSON.stringify(feature))
    const verticalTransitions = cleanupFeatureRoutingReferences(building, feature.id)
    // Its partners on the floors below / above lose their link to it (undo restores both from the snapshot).
    clearFeatureLinks(building, featureType as FeatureKind, feature.id)

    if (featureType === 'staircase') {
      if (building.staircases) {
        const idx = building.staircases.findIndex(s => s.id === feature.id)
        if (idx !== -1) building.staircases.splice(idx, 1)
      }
      for (const fl of building.floors) {
        if (fl.staircases) {
          fl.staircases = fl.staircases.filter((s: any) => s.id !== feature.id && s.id !== featureId)
        }
      }
    } else if (featureType === 'elevator') {
      if (building.elevators) {
        const idx = building.elevators.findIndex(e => e.id === feature.id)
        if (idx !== -1) building.elevators.splice(idx, 1)
      }
      for (const fl of building.floors) {
        if (fl.elevators) {
          fl.elevators = fl.elevators.filter((e: any) => e.id !== feature.id && e.id !== featureId)
        }
      }
    }

    for(const [level,geometry] of Object.entries(feature.levels)){const floor=building.floors.find(f=>f.level===Number(level));if(floor&&geometry.routeConnection)removeFeatureRoutePort(floor,geometry.routeConnection,building)}
    recordChange(document, { entityId: feature.id, entityType: featureType as string, operation: 'deleted' })
    return { success: true, entityId: feature.id, data: { oldFeature, buildingId: building.id, featureType, verticalTransitions } }

  },
  inverse(_payload: Record<string, unknown>, _result: MutationResult): Command | null {
    // Snapshot undo (2026-11-08): re-creating through feature.create lost the floor and the partners' links.
    return null
  },
}

export const featureReplaceHandler: CommandHandler = {
  id: 'feature.replace',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const featureId = payload.featureId as string
    const newType = payload.newType as 'staircase' | 'elevator'

    const ctx = findFeature(document, featureId)
    if (!ctx) return { success: false, error: `Feature not found: ${featureId}` }

    const { building, feature, featureType: oldType } = ctx
    if (oldType === newType) return { success: false, error: `Feature is already of type ${newType}` }
    // Links join the same kind only: a stair turned into a lift (or back) starts unconnected.
    clearFeatureLinks(building, oldType as FeatureKind, feature.id)

    const oldFeature = JSON.parse(JSON.stringify(feature))
    const newId = genId(newType === 'staircase' ? 'stair' : 'elev')

    // Remove old feature
    if (oldType === 'staircase' && building.staircases) {
      const idx = building.staircases.findIndex(s => s.id === featureId)
      if (idx !== -1) building.staircases.splice(idx, 1)
    } else if (oldType === 'elevator' && building.elevators) {
      const idx = building.elevators.findIndex(e => e.id === featureId)
      if (idx !== -1) building.elevators.splice(idx, 1)
    }

    // Prepare mode-neutral levels
    const levels: Record<number, any> = {}
    for (const [lvlKey, lvlGeom] of Object.entries(feature.levels)) {
      const lvl = Number(lvlKey)
      const cleanGeom: any = {
        position: { ...lvlGeom.position },
        rotation: lvlGeom.rotation,
        ...(lvlGeom.polygon ? { polygon: JSON.parse(JSON.stringify(lvlGeom.polygon)) } : {}),
        ...(lvlGeom.landing ? { landing: JSON.parse(JSON.stringify(lvlGeom.landing)) } : {}),
      }
      if (lvlGeom.drawing) {
        const defId = newType === 'staircase' ? 'stair' : 'elevator'
        const defaultProperties = newType === 'staircase'
          ? { stepCount: 10, stepWidth: 1.2, stepDepth: 0.3, direction: 'up', preset: 'straight' }
          : { width: 2.0, depth: 2.0, doorSide: 'front' }
        cleanGeom.drawing = {
          definitionId: defId,
          properties: (payload.newDrawingProperties as Record<string, unknown>) ?? defaultProperties,
        }
      }
      levels[lvl] = cleanGeom
    }

    if (newType === 'staircase') {
      const newFeature: Staircase = {
        id: newId,
        buildingId: building.id,
        name: feature.name,
        type: 'standard',
        accessible: feature.accessible,
        fromLevel: feature.fromLevel,
        toLevel: feature.toLevel,
        levels,
      }
      if (!building.staircases) building.staircases = []
      building.staircases.push(newFeature)
    } else {
      const newFeature: Elevator = {
        id: newId,
        buildingId: building.id,
        name: feature.name,
        type: 'passenger',
        accessible: feature.accessible,
        fromLevel: feature.fromLevel,
        toLevel: feature.toLevel,
        levels,
      }
      if (!building.elevators) building.elevators = []
      building.elevators.push(newFeature)
    }

    recordChange(document, { entityId: featureId, entityType: oldType, operation: 'deleted' })
    recordChange(document, { entityId: newId, entityType: newType, operation: 'created' })

    return { success: true, entityId: newId, data: { oldFeature, newId } }
  },
  inverse(): Command | null {
    return null
  },
}

// ── P1-T8: Window handlers ──
// Windows are wall-attached entities living at Floor.windows.
// Positioned via wallId (composite reference) and offset (meters from wall start).

function findFloorAndWindow(document: CampusDocument, windowId: string) {
  for (const building of document.buildings) {
    for (const floor of building.floors) {
      const win = floor.windows?.find(w => w.id === windowId)
      if (win) return { building, floor, window: win }
    }
  }
  return null
}

export const windowCreateHandler: CommandHandler = {
  id: 'window.create',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const buildingId = payload.buildingId as string
    const floorId = payload.floorId as string
    const building = document.buildings.find(b => b.id === buildingId)
    if (!building) return { success: false, error: `Building not found: ${buildingId}` }
    const floor = building.floors.find(f => f.id === floorId)
    if (!floor) return { success: false, error: `Floor not found: ${floorId}` }

    const windowInput = (payload.window as Record<string, unknown>) ?? {}
    const wallId = windowInput.wallId as string
    if (!wallId || typeof wallId !== 'string') {
      return { success: false, error: 'Window wallId is required (composite wall reference)' }
    }
    const offset = windowInput.offset as number
    if (typeof offset !== 'number' || offset < 0) {
      return { success: false, error: 'Window offset must be a non-negative number (meters from wall start)' }
    }

    const id = (windowInput.id as string) || genId('win')
    const win: Window = {
      id,
      wallId,
      offset,
      width: (windowInput.width as number) ?? 1.2,
      sillHeight: (windowInput.sillHeight as number) ?? 0.9,
      metadata: (windowInput.metadata as Record<string, unknown>) ?? {},
    }
    if (!floor.windows) floor.windows = []
    floor.windows.push(win)

    recordChange(document, { entityId: id, entityType: 'window', operation: 'created' })
    return { success: true, entityId: id, data: { id, buildingId, floorId } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const id = result.entityId ?? ((payload.window as Record<string, unknown> | undefined)?.id as string)
    return {
      id: 'window.delete',
      label: 'Undo Create Window',
      payload: { windowId: id },
    }
  },
}

export const windowUpdateHandler: CommandHandler = {
  id: 'window.update',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const windowId = payload.windowId as string
    const patch = (payload.patch as Record<string, unknown>) ?? {}

    const ctx = findFloorAndWindow(document, windowId)
    if (!ctx) return { success: false, error: `Window not found: ${windowId}` }

    const old = {
      wallId: ctx.window.wallId,
      offset: ctx.window.offset,
      width: ctx.window.width,
      sillHeight: ctx.window.sillHeight,
    }

    if (patch.wallId != null) ctx.window.wallId = patch.wallId as string
    if (patch.offset != null) ctx.window.offset = patch.offset as number
    if (patch.width != null) ctx.window.width = patch.width as number
    if (patch.sillHeight != null) ctx.window.sillHeight = patch.sillHeight as number

    recordChange(document, { entityId: windowId, entityType: 'window', operation: 'updated' })
    return { success: true, entityId: windowId, data: { old } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const old = result.data?.old as { wallId: string; offset: number; width: number; sillHeight: number } | undefined
    if (!old) return null
    return {
      id: 'window.update',
      label: 'Undo Window Update',
      payload: { windowId: payload.windowId as string, patch: old },
    }
  },
}

export const windowDeleteHandler: CommandHandler = {
  id: 'window.delete',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const windowId = payload.windowId as string
    const ctx = findFloorAndWindow(document, windowId)
    if (!ctx) return { success: false, error: `Window not found: ${windowId}` }

    const oldWindow = JSON.parse(JSON.stringify(ctx.window)) as Window
    ctx.floor.windows = ctx.floor.windows!.filter(w => w.id !== windowId)

    recordChange(document, { entityId: windowId, entityType: 'window', operation: 'deleted' })
    return { success: true, entityId: windowId, data: { oldWindow, buildingId: ctx.building.id, floorId: ctx.floor.id } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const oldWindow = result.data?.oldWindow as Window | undefined
    if (!oldWindow) return null
    return {
      id: 'window.create',
      label: 'Undo Delete Window',
      payload: {
        buildingId: result.data?.buildingId as string,
        floorId: result.data?.floorId as string,
        window: {
          id: oldWindow.id,
          wallId: oldWindow.wallId,
          offset: oldWindow.offset,
          width: oldWindow.width,
          sillHeight: oldWindow.sillHeight,
          metadata: oldWindow.metadata,
        },
      },
    }
  },
}

// ── W7A: Opening handlers ──
// Openings are wall-attached entities living at Floor.openings.
// Positioned via wallId (reference to Wall.id) and offset (meters from wall start).
// Actual position is derived from wall geometry, never stored.

function findFloorAndOpening(document: CampusDocument, openingId: string) {
  for (const building of document.buildings) {
    for (const floor of building.floors) {
      const opening = floor.openings?.find(o => o.id === openingId)
      if (opening) return { building, floor, opening }
    }
  }
  return null
}

export function validateOpeningAssignment(floor: CampusDocument['buildings'][number]['floors'][number], opening: Opening): string | undefined {
  if (opening.doorAppearance !== undefined && (opening.type !== 'door' || !DOOR_APPEARANCES.includes(opening.doorAppearance))) return 'Invalid door appearance or opening type'
  if (opening.doorPose !== undefined && (opening.type !== 'door' || !DOOR_POSES.includes(opening.doorPose))) return 'Door position must be closed, ajar or open and belong to a door'
  const hasDoorStyle = opening.doorOperation !== undefined || opening.hingeSide !== undefined || opening.swingSide !== undefined
  if (hasDoorStyle && opening.type !== 'door') return 'Door operation, hinge and swing belong to door openings only'
  if ((opening.windowAppearance !== undefined || opening.windowPose !== undefined) && opening.type !== 'window') return 'Window appearance and position belong to window openings only'
  const openingStyleError = opening.type === 'window'
    ? windowStyleFieldError(opening as unknown as Record<string, unknown>)
    : doorStyleFieldError(opening as unknown as Record<string, unknown>)
  if (openingStyleError) return openingStyleError
  const wall=floor.walls?.find(wall=>wall.id===opening.wallId)
  if(!wall)return 'Opening host wall not found: '+opening.wallId
  const length=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y)
  const bottom=opening.sillHeight??(opening.type==='window'?0.9:0),height=opening.height??(opening.type==='window'?1.2:2.1)
  if(![opening.offset,opening.width,bottom,height,length,wall.height].every(Number.isFinite)||opening.offset<0||opening.width<0.2||height<=0||bottom<0||opening.offset+opening.width>length+1e-7||bottom+height>wall.height+1e-7)return 'Opening '+opening.id+' must fit within its wall with positive finite dimensions'
  const spans=[...(floor.windows??[]).filter(w=>floor.walls?.some(wall=>wall.id===w.wallId)).map(w=>({id:w.id,wallId:w.wallId,start:w.offset,end:w.offset+w.width,bottom:w.sillHeight,top:w.sillHeight+1.2})),...(floor.openings??[]).filter(o=>o.id!==opening.id).map(o=>({id:o.id,wallId:o.wallId,start:o.offset,end:o.offset+o.width,bottom:o.sillHeight??(o.type==='window'?0.9:0),top:(o.sillHeight??(o.type==='window'?0.9:0))+(o.height??(o.type==='window'?1.2:2.1))})),...(floor.doors??[]).filter(d=>d.wallAttachment).map(d=>({id:d.id,wallId:d.wallAttachment!.wallId,start:d.wallAttachment!.offset-d.width/2,end:d.wallAttachment!.offset+d.width/2,bottom:0,top:d.wallAttachment!.openingHeight}))]
  const overlap=spans.find(span=>span.wallId===opening.wallId&&Math.min(opening.offset+opening.width,span.end)-Math.max(opening.offset,span.start)>1e-7&&Math.min(bottom+height,span.top)-Math.max(bottom,span.bottom)>1e-7)
  return overlap?'Opening '+opening.id+' overlaps attachment '+overlap.id:undefined
}

export const openingCreateHandler: CommandHandler = {
  id: 'opening.create',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const buildingId = payload.buildingId as string
    const floorId = payload.floorId as string
    const building = document.buildings.find(b => b.id === buildingId)
    if (!building) return { success: false, error: `Building not found: ${buildingId}` }
    const floor = building.floors.find(f => f.id === floorId)
    if (!floor) return { success: false, error: `Floor not found: ${floorId}` }

    // Internal inverse snapshot, matching opening.update: imported values must
    // remain exactly undoable even when forward validation becomes stricter.
    if (payload.restoreOpening !== undefined) {
      const opening = structuredClone(payload.restoreOpening) as Opening
      if (!opening || typeof opening.id !== 'string' || !opening.id || !['door', 'window'].includes(opening.type)) {
        return { success: false, error: 'Opening identity/type is invalid' }
      }
      if (findFloorAndOpening(document, opening.id)) return { success: false, error: `Opening already exists: ${opening.id}` }
      if (!floor.openings) floor.openings = []
      floor.openings.push(opening)
      recordChange(document, { entityId: opening.id, entityType: 'opening', operation: 'created' })
      return { success: true, entityId: opening.id, data: { id: opening.id, buildingId, floorId } }
    }

    const openingInput = (payload.opening as Record<string, unknown>) ?? {}
    const wallId = openingInput.wallId as string
    if (!wallId || typeof wallId !== 'string') {
      return { success: false, error: 'Opening wallId is required (reference to Wall.id)' }
    }
    const offset = openingInput.offset as number
    if (typeof offset !== 'number' || offset < 0) {
      return { success: false, error: 'Opening offset must be a non-negative number (meters from wall start)' }
    }
    const openingType = openingInput.type as string
    if (openingType !== 'door' && openingType !== 'window') {
      return { success: false, error: `Invalid opening type: ${String(openingType)}. Must be 'door' or 'window'.` }
    }
    const orientation = openingInput.orientation
    if (orientation !== undefined && (typeof orientation !== 'number' || !Number.isFinite(orientation))) {
      return { success: false, error: 'Opening orientation must be a finite number of degrees' }
    }

    const id = (openingInput.id as string) || genId('opening')
    const opening: Opening = {
      id,
      type: openingType as 'door' | 'window',
      wallId,
      offset,
      width: (openingInput.width as number) ?? (openingType === 'window' ? 1.2 : 0.9),
      ...(orientation !== undefined ? { orientation } : {}),
      ...(openingInput.height !== undefined ? { height: openingInput.height as number } : {}),
      ...(openingInput.sillHeight !== undefined ? { sillHeight: openingInput.sillHeight as number } : {}),
      ...(openingInput.windowAppearance !== undefined ? { windowAppearance: openingInput.windowAppearance as Opening['windowAppearance'] } : {}),
      ...(openingInput.doorAppearance !== undefined ? { doorAppearance: openingInput.doorAppearance as Opening['doorAppearance'] } : {}),
      ...(openingInput.doorPose !== undefined ? { doorPose: openingInput.doorPose as Opening['doorPose'] } : {}),
      ...Object.fromEntries((['windowPose', 'doorOperation', 'hingeSide', 'swingSide', 'assetPreset', 'material', 'glass'] as const)
        .filter(key => openingInput[key] !== undefined).map(key => [key, openingInput[key]])),
      ...(openingInput.metadata !== undefined ? { metadata: openingInput.metadata as Record<string, unknown> } : {}),
    }
    const invalid = validateOpeningAssignment(floor, opening)
    if (invalid) return { success: false, error: invalid }
    if (!floor.openings) floor.openings = []
    floor.openings.push(opening)

    recordChange(document, { entityId: id, entityType: 'opening', operation: 'created' })
    return { success: true, entityId: id, data: { id, buildingId, floorId } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const id = result.entityId ?? ((payload.opening as Record<string, unknown> | undefined)?.id as string)
    return {
      id: 'opening.delete',
      label: 'Undo Create Opening',
      payload: { openingId: id },
    }
  },
}

export const openingUpdateHandler: CommandHandler = {
  id: 'opening.update',
  execute(document:CampusDocument,payload:Record<string,unknown>):MutationResult {
    const ctx=findFloorAndOpening(document,payload.openingId as string)
    if(!ctx)return {success:false,error:'Opening not found: '+payload.openingId}
    const oldOpening=structuredClone(ctx.opening)
    const candidate=payload.restoreOpening!==undefined?structuredClone(payload.restoreOpening) as Opening:{...ctx.opening,...structuredClone((payload.patch as Partial<Opening>)??{})}
    if(candidate.id!==ctx.opening.id||!['door','window'].includes(candidate.type))return {success:false,error:'Opening identity/type is invalid'}
    // Undo restores an exact prior snapshot, including unresolved imported defects.
    // Forward edits remain strict so repairing an old defect is safely reversible.
    if(payload.restoreOpening===undefined){
      const error=validateOpeningAssignment(ctx.floor,candidate)
      if(error)return {success:false,error}
    }
    ctx.floor.openings![ctx.floor.openings!.findIndex(o=>o.id===candidate.id)]=candidate
    recordChange(document,{entityId:candidate.id,entityType:'opening',operation:'updated'})
    return {success:true,entityId:candidate.id,data:{oldOpening}}
  },
  inverse(payload:Record<string,unknown>,result:MutationResult):Command|null {
    return result.data?.oldOpening?{id:'opening.update',label:'Undo Opening Update',payload:{openingId:payload.openingId,restoreOpening:result.data.oldOpening}}:null
  },
}

export const openingDeleteHandler: CommandHandler = {
  id: 'opening.delete',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const openingId = payload.openingId as string
    const ctx = findFloorAndOpening(document, openingId)
    if (!ctx) return { success: false, error: `Opening not found: ${openingId}` }

    const oldOpening = structuredClone(ctx.opening)
    ctx.floor.openings = ctx.floor.openings!.filter(o => o.id !== openingId)

    recordChange(document, { entityId: openingId, entityType: 'opening', operation: 'deleted' })
    return { success: true, entityId: openingId, data: { oldOpening, buildingId: ctx.building.id, floorId: ctx.floor.id } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const oldOpening = result.data?.oldOpening as Opening | undefined
    if (!oldOpening) return null
    return {
      id: 'opening.create',
      label: 'Undo Delete Opening',
      payload: {
        buildingId: result.data?.buildingId as string,
        floorId: result.data?.floorId as string,
        restoreOpening: structuredClone(oldOpening),
        opening: {
          id: oldOpening.id,
          type: oldOpening.type,
          wallId: oldOpening.wallId,
          offset: oldOpening.offset,
          width: oldOpening.width,
          orientation: oldOpening.orientation,
          height: oldOpening.height,
          sillHeight: oldOpening.sillHeight,
          windowAppearance: oldOpening.windowAppearance,
          metadata: oldOpening.metadata,
        },
      },
    }
  },
}
