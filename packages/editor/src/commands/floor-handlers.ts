import { recordChange } from '@navi/core'
import type { CampusDocument } from '@navi/core'
import type { CommandHandler, Command, MutationResult } from './types'

export const floorCreateHandler: CommandHandler = {
  id: 'floor.create',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const buildingId = payload.buildingId as string
    const building = document.buildings.find(b => b.id === buildingId)
    if (!building) return { success: false, error: `Building not found: ${buildingId}` }

    const id = (payload.id as string) || `flr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const label = (payload.label as string) || `Floor ${building.floors.length + 1}`
    const level = (payload.level as number) ?? building.floors.length

    building.floors.push({ id, level, label, elevation: level * 4, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], metadata: {} })

    recordChange(document, { entityId: id, entityType: 'floor', operation: 'created' })
    return { success: true, entityId: id, data: { id, buildingId } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const id = (result.data?.id as string) || payload.id as string
    return { id: 'floor.delete', label: 'Undo Create Floor', payload: { floorId: id, buildingId: result.data?.buildingId as string } }
  },
}

export const floorRenameHandler: CommandHandler = {
  id: 'floor.rename',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const floorId = payload.floorId as string
    const newLabel = payload.label as string
    for (const bld of document.buildings) {
      const floor = bld.floors.find(f => f.id === floorId)
      if (floor) {
        const oldLabel = floor.label
        floor.label = newLabel
        recordChange(document, { entityId: floorId, entityType: 'floor', operation: 'updated' })
        return { success: true, entityId: floorId, data: { oldLabel } }
      }
    }
    return { success: false, error: `Floor not found: ${floorId}` }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    return {
      id: 'floor.rename',
      label: 'Undo Rename Floor',
      payload: { floorId: payload.floorId as string, label: result.data?.oldLabel as string },
    }
  },
}

export const floorDeleteHandler: CommandHandler = {
  id: 'floor.delete',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const floorId = payload.floorId as string
    for (const bld of document.buildings) {
      const index = bld.floors.findIndex(f => f.id === floorId)
      if (index !== -1) {
        bld.floors.splice(index, 1)
        recordChange(document, { entityId: floorId, entityType: 'floor', operation: 'deleted' })
        return { success: true, entityId: floorId }
      }
    }
    return { success: false, error: `Floor not found: ${floorId}` }
  },
  inverse(): Command | null {
    return null
  },
}

export const floorDuplicateHandler: CommandHandler = {
  id: 'floor.duplicate',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const floorId = payload.floorId as string
    for (const bld of document.buildings) {
      const sourceFloor = bld.floors.find(f => f.id === floorId)
      if (sourceFloor) {
        const newId = `flr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const newLevel = bld.floors.length
        bld.floors.push({
          id: newId,
          level: newLevel,
          label: `${sourceFloor.label} (copy)`,
          elevation: newLevel * 4,
          rooms: JSON.parse(JSON.stringify(sourceFloor.rooms.map(r => ({ ...r, id: `rm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })))),
          hallways: JSON.parse(JSON.stringify(sourceFloor.hallways.map(h => ({ ...h, id: `hw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })))),
          staircases: JSON.parse(JSON.stringify(sourceFloor.staircases.map(s => ({ ...s, id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })))),
          elevators: JSON.parse(JSON.stringify(sourceFloor.elevators.map(e => ({ ...e, id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })))),
          entrances: JSON.parse(JSON.stringify(sourceFloor.entrances.map(e => ({ ...e, id: `ent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })))),
          metadata: {},
        })
        recordChange(document, { entityId: newId, entityType: 'floor', operation: 'created' })
        return { success: true, entityId: newId, data: { id: newId } }
      }
    }
    return { success: false, error: `Floor not found: ${floorId}` }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const id = (result.data?.id as string) || payload.id as string
    return { id: 'floor.delete', label: 'Undo Duplicate Floor', payload: { floorId: id } }
  },
}
