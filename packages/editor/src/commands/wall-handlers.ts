import { recordChange } from '@navi/core'
import type { CampusDocument, LocalCoord } from '@navi/core'
import type { CommandHandler, Command, MutationResult } from './types'
import { genId } from '../id'
import { prepareWallAttachmentUpdate, applyWallAttachmentState, snapshotWallAttachmentState } from '../geometry/door-wall-attachment'
import type { WallAttachmentState } from '../geometry/door-wall-attachment'

const DEFAULT_WALL_THICKNESS = 0.15
const DEFAULT_WALL_HEIGHT = 3.5

export const wallCreateHandler: CommandHandler = {
  id: 'wall.create',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const buildingId = payload.buildingId as string
    const floorId = payload.floorId as string
    const start = payload.start as LocalCoord
    const end = payload.end as LocalCoord

    if (!buildingId || !floorId) {
      return { success: false, error: 'buildingId and floorId are required' }
    }
    if (!start || !end) {
      return { success: false, error: 'start and end coordinates are required' }
    }
    if (start.x === end.x && start.y === end.y) {
      return { success: false, error: 'wall start and end must be different points' }
    }

    const thickness = (payload.thickness as number) ?? DEFAULT_WALL_THICKNESS
    const height = (payload.height as number) ?? DEFAULT_WALL_HEIGHT
    if (!Number.isFinite(thickness) || thickness <= 0) {
      return { success: false, error: 'wall thickness must be greater than 0' }
    }
    if (!Number.isFinite(height) || height <= 0) {
      return { success: false, error: 'wall height must be greater than 0' }
    }

    const building = document.buildings.find(b => b.id === buildingId)
    if (!building) return { success: false, error: `Building not found: ${buildingId}` }

    const floor = building.floors.find(f => f.id === floorId)
    if (!floor) return { success: false, error: `Floor not found: ${floorId}` }

    if (!floor.walls) floor.walls = []

    const id = (payload.id as string) || genId('wall')
    const metadata = (payload.metadata as Record<string, unknown>) ?? {}

    const wall = {
      id,
      start,
      end,
      thickness,
      height,
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    }

    const existing = floor.walls.findIndex(w => w.id === id)
    if (existing >= 0) {
      floor.walls[existing] = wall
    } else {
      floor.walls.push(wall)
    }

    recordChange(document, { entityId: id, entityType: 'wall', operation: 'created' })
    return { success: true, entityId: id, data: { id, buildingId, floorId } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    return {
      id: 'wall.delete',
      label: 'Undo Create Wall',
      payload: {
        wallId: result.data?.id as string,
        buildingId: result.data?.buildingId as string,
        floorId: result.data?.floorId as string,
      },
    }
  },
}

export const wallUpdateHandler: CommandHandler = {
  id: 'wall.update',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const wallId = payload.wallId as string
    const buildingId = payload.buildingId as string
    const floorId = payload.floorId as string

    if (!wallId) return { success: false, error: 'wallId is required' }

    const building = document.buildings.find(b => b.id === buildingId)
    if (!building) return { success: false, error: `Building not found: ${buildingId}` }

    const floor = building.floors.find(f => f.id === floorId)
    if (!floor) return { success: false, error: `Floor not found: ${floorId}` }

    if (!floor.walls) return { success: false, error: `No walls on floor: ${floorId}` }

    const wall = floor.walls.find(w => w.id === wallId)
    if (!wall) return { success: false, error: `Wall not found: ${wallId}` }

    const patch = payload.patch as Record<string, unknown> | undefined
    if (!patch) return { success: false, error: 'patch is required' }
    const restoreAttachmentState = payload.restoreAttachmentState as WallAttachmentState | undefined

    for (const key of ['height', 'thickness'] as const) {
      if (patch[key] !== undefined && (typeof patch[key] !== 'number' || !Number.isFinite(patch[key]) || (patch[key] as number) <= 0)) {
        return { success: false, error: 'Wall ' + key + ' must be a positive finite number' }
      }
    }
    if (patch.height !== undefined && !restoreAttachmentState) {
      for (const opening of floor.openings ?? []) {
        if (opening.wallId !== wallId) continue
        const top = (opening.sillHeight ?? (opening.type === 'window' ? 0.9 : 0)) + (opening.height ?? (opening.type === 'window' ? 1.2 : 2.1))
        if (top > (patch.height as number) + 1e-8) return { success: false, error: 'Opening ' + opening.id + ' exceeds the proposed wall height' }
      }
    }

    const nextWall = { ...wall, ...patch } as typeof wall
    if (![nextWall.start?.x, nextWall.start?.y, nextWall.end?.x, nextWall.end?.y].every(value => typeof value === 'number' && Number.isFinite(value)) || Math.hypot(nextWall.end.x - nextWall.start.x, nextWall.end.y - nextWall.start.y) < 1e-8) {
      return { success: false, error: 'Wall endpoints must be finite and distinct' }
    }
    // An inverse restores authored state exactly, including pre-existing imported defects.
    // Ordinary edits still require all changed wall attachments to fit before mutation.
    const attachmentUpdate = restoreAttachmentState
      ? { ok: true as const, state: restoreAttachmentState, before: snapshotWallAttachmentState(floor), changedDoorIds: (restoreAttachmentState.doors ?? []).filter(door => JSON.stringify(door) !== JSON.stringify(floor.doors?.find(current => current.id === door.id))).map(door => door.id) }
      : prepareWallAttachmentUpdate(floor, floor.walls.map(candidate => candidate.id === wallId ? nextWall : candidate))
    if (!attachmentUpdate.ok) return { success: false, error: attachmentUpdate.error }

    const snapshot = {
      start: { ...wall.start },
      end: { ...wall.end },
      thickness: wall.thickness,
      height: wall.height,
      metadata: wall.metadata ? { ...wall.metadata } : undefined,
    }

    if (patch.start !== undefined) wall.start = patch.start as LocalCoord
    if (patch.end !== undefined) wall.end = patch.end as LocalCoord
    if (patch.thickness !== undefined) wall.thickness = patch.thickness as number
    if (patch.height !== undefined) wall.height = patch.height as number
    if (patch.metadata !== undefined) wall.metadata = patch.metadata as Record<string, unknown>

    applyWallAttachmentState(floor, (payload.restoreAttachmentState as WallAttachmentState | undefined) ?? attachmentUpdate.state)
    for (const doorId of attachmentUpdate.changedDoorIds) recordChange(document, { entityId: doorId, entityType: 'door', operation: 'updated' })
    recordChange(document, { entityId: wallId, entityType: 'wall', operation: 'updated' })
    return { success: true, entityId: wallId, data: { snapshot, attachmentState: attachmentUpdate.before } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const snapshot = result.data?.snapshot as {
      start: LocalCoord
      end: LocalCoord
      thickness: number
      height: number
      metadata?: Record<string, unknown>
    }
    if (!snapshot) return null
    return {
      id: 'wall.update',
      label: 'Undo Update Wall',
      payload: {
        wallId: payload.wallId,
        buildingId: payload.buildingId,
        floorId: payload.floorId,
        patch: snapshot,
        restoreAttachmentState: result.data?.attachmentState,
      },
    }
  },
}

export const wallDeleteHandler: CommandHandler = {
  id: 'wall.delete',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const wallId = payload.wallId as string
    const buildingId = payload.buildingId as string
    const floorId = payload.floorId as string

    if (!wallId) return { success: false, error: 'wallId is required' }

    const building = document.buildings.find(b => b.id === buildingId)
    if (!building) return { success: false, error: `Building not found: ${buildingId}` }

    const floor = building.floors.find(f => f.id === floorId)
    if (!floor) return { success: false, error: `Floor not found: ${floorId}` }

    if (!floor.walls) return { success: false, error: `No walls on floor: ${floorId}` }

    const index = floor.walls.findIndex(w => w.id === wallId)
    if (index === -1) return { success: false, error: `Wall not found: ${wallId}` }

    const attachments = prepareWallAttachmentUpdate(floor, floor.walls.filter(candidate => candidate.id !== wallId))
    if (!attachments.ok) return { success: false, error: attachments.error }
    const removed = floor.walls.splice(index, 1)[0]

    recordChange(document, { entityId: wallId, entityType: 'wall', operation: 'deleted' })
    return { success: true, entityId: wallId, data: { removed, buildingId, floorId } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const removed = result.data?.removed as { id: string; start: LocalCoord; end: LocalCoord; thickness: number; height: number; metadata?: Record<string, unknown> }
    if (!removed) return null
    return {
      id: 'wall.create',
      label: 'Undo Delete Wall',
      payload: {
        id: removed.id,
        buildingId: result.data?.buildingId as string,
        floorId: result.data?.floorId as string,
        start: removed.start,
        end: removed.end,
        thickness: removed.thickness,
        height: removed.height,
        ...(removed.metadata ? { metadata: removed.metadata } : {}),
      },
    }
  },
}
