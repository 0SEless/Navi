import {syncFeatureRoutePort,featureRouteNetworkSnapshot,restoreFeatureRouteNetwork} from '../geometry/feature-route-port'
import { recordChange } from '@navi/core'
import type { CampusDocument, LocalCoord, Staircase, Elevator, StairLevelGeometry, ElevatorLevelGeometry } from '@navi/core'
import type { CommandHandler, Command, MutationResult } from './types'

// ── P1-T9 (R2.6/R8.4/D19/Q10): per-floor feature placement handlers ──
// Stair/elevator features own cross-floor identity via `levels`. These
// commands touch ONLY the targeted floor's `levels` entry — moving a stair
// on F0 never auto-moves F1/F2 (no silent auto-sync). The copy/align command
// is the EXPLICIT convenience for aligning one floor to another, with undo.
//
// R15.4: no command may default per-level geometry to {x:0,y:0} — update
// applies exactly the given patch; copy duplicates the source entry verbatim.

type FeatureType = 'staircase' | 'elevator'

function findFeature(document: CampusDocument, featureId: string, featureType: FeatureType) {
  for (const building of document.buildings) {
    const features = featureType === 'staircase' ? building.staircases : building.elevators
    const feature = features?.find(f => f.id === featureId)
    if (feature) return { building, feature }
  }
  return null
}

function notFoundMessage(featureId: string, featureType: FeatureType): string {
  return `${featureType === 'staircase' ? 'Staircase' : 'Elevator'} feature not found: ${featureId}`
}

export const featureLevelUpdateHandler: CommandHandler = {
  id: 'feature.level.update',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const featureId = payload.featureId as string
    const featureType = payload.featureType as FeatureType
    const floor = payload.floor as number
    const patch = (payload.patch as Record<string, unknown>) ?? {}

    const found = findFeature(document, featureId, featureType)
    if (!found) return { success: false, error: notFoundMessage(featureId, featureType) }
    const { feature } = found

    const levels = feature.levels as Record<number, StairLevelGeometry | ElevatorLevelGeometry>
    const current = levels[floor]
    if (!current) return { success: false, error: `Placement not found on floor ${floor} for ${featureId}` }

    if ('restoreLevel' in payload) {
      levels[floor] = structuredClone(payload.restoreLevel as StairLevelGeometry | ElevatorLevelGeometry)
      restoreFeatureRouteNetwork(found.building, floor, payload.restoreRouteNetwork as ReturnType<typeof featureRouteNetworkSnapshot>)
      recordChange(document, { entityId: featureId, entityType: featureType, operation: 'restored' })
      return { success: true, entityId: featureId }
    }

    if (patch.position !== undefined) {
      const pos = patch.position as LocalCoord
      if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
        return { success: false, error: 'Feature placement position must be a building-local LocalCoord ({x, y} meters)' }
      }
    }
    if (patch.rotation !== undefined && typeof patch.rotation !== 'number') {
      return { success: false, error: `Feature placement rotation must be a number: ${String(patch.rotation)}` }
    }

    // Verbatim snapshot for undo (R15.9 — exact key-presence).
    const old = JSON.parse(JSON.stringify(current)) as StairLevelGeometry | ElevatorLevelGeometry

    const previousNetwork = featureRouteNetworkSnapshot(found.building, floor)
    if (patch.position != null) {
      const pos = patch.position as LocalCoord
      current.position = { x: pos.x, y: pos.y }
    }
    if (patch.rotation != null) current.rotation = patch.rotation as number

    const error = syncFeatureRoutePort(found.building, feature, floor)
    if (error) {
      levels[floor] = old
      restoreFeatureRouteNetwork(found.building, floor, previousNetwork)
      return { success: false, error }
    }
    recordChange(document, { entityId: featureId, entityType: featureType, operation: 'updated' })
    return { success: true, entityId: featureId, data: { old, floor, featureType, previousNetwork } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const old = result.data?.old as StairLevelGeometry | ElevatorLevelGeometry | undefined
    if (!old) return null
    return {
      id: 'feature.level.update',
      label: 'Undo Feature Level Update',
      payload: {
        featureId: payload.featureId as string,
        featureType: payload.featureType as FeatureType,
        floor: result.data?.floor as number,
        restoreLevel: old,
        restoreRouteNetwork: result.data?.previousNetwork,
      },
    }
  },
}

export const featureLevelCopyHandler: CommandHandler = {
  id: 'feature.level.copy',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const featureId = payload.featureId as string
    const featureType = payload.featureType as FeatureType
    const fromFloor = payload.fromFloor as number
    const toFloor = payload.toFloor as number

    // Dual-mode: restore (payload.restore present) or copy (fromFloor/toFloor).
    if (payload.restore !== undefined) {
      const found = findFeature(document, featureId, featureType)
      if (!found) return { success: false, error: notFoundMessage(featureId, featureType) }
      const levels = found.feature.levels as Record<number, StairLevelGeometry | ElevatorLevelGeometry>
      if (payload.restore === null) {
        // Target had NO placement before the copy — undo removes the key.
        delete levels[toFloor]
      } else {
        levels[toFloor] = JSON.parse(JSON.stringify(payload.restore)) as StairLevelGeometry | ElevatorLevelGeometry
      }
      if ('restoreRouteNetwork' in payload)restoreFeatureRouteNetwork(found.building,toFloor,payload.restoreRouteNetwork as ReturnType<typeof featureRouteNetworkSnapshot>)
      recordChange(document, { entityId: featureId, entityType: featureType, operation: 'restored' })
      return { success: true, entityId: featureId }
    }

    const found = findFeature(document, featureId, featureType)
    if (!found) return { success: false, error: notFoundMessage(featureId, featureType) }
    const { feature } = found
    const levels = feature.levels as Record<number, StairLevelGeometry | ElevatorLevelGeometry>
    const source = levels[fromFloor]
    if (!source) return { success: false, error: `Placement not found on floor ${fromFloor} for ${featureId}` }

    // Verbatim snapshot of the CURRENT target (or null if absent) for undo.
    const previousTarget = levels[toFloor] !== undefined
      ? JSON.parse(JSON.stringify(levels[toFloor])) as StairLevelGeometry | ElevatorLevelGeometry
      : null

    const previousNetwork=featureRouteNetworkSnapshot(found.building,toFloor)
    const copied=structuredClone(source)
    delete copied.routeConnection
    delete copied.routeConnectionManaged
    if(previousTarget?.routeConnection)copied.routeConnection=structuredClone(previousTarget.routeConnection)
    if(previousTarget?.routeConnectionManaged!==undefined)copied.routeConnectionManaged=previousTarget.routeConnectionManaged
    else if(source.routeConnection||source.routeConnectionManaged)copied.routeConnectionManaged=true
    levels[toFloor]=copied
    const error=syncFeatureRoutePort(found.building,feature,toFloor)
    if(error){if(previousTarget)levels[toFloor]=previousTarget;else delete levels[toFloor];restoreFeatureRouteNetwork(found.building,toFloor,previousNetwork);return {success:false,error}}


    recordChange(document, { entityId: featureId, entityType: featureType, operation: 'updated' })
    return { success: true, entityId: featureId, data: { previousTarget, toFloor, featureType,previousNetwork } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    if (!result.data) return null
    return {
      id: 'feature.level.copy',
      label: 'Undo Feature Level Copy',
      payload: {
        featureId: payload.featureId as string,
        featureType: payload.featureType as FeatureType,
        toFloor: result.data?.toFloor as number,
        restore: result.data?.previousTarget as StairLevelGeometry | ElevatorLevelGeometry | null,
        restoreRouteNetwork: result.data?.previousNetwork,
      },
    }
  },
}