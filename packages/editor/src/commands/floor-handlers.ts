import { recordChange } from '@navi/core'
import type { CampusDocument } from '@navi/core'
import type { CommandHandler, Command, MutationResult } from './types'
import { genId } from '../id'

export const floorCreateHandler: CommandHandler = {
  id: 'floor.create',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const buildingId = payload.buildingId as string
    const building = document.buildings.find(b => b.id === buildingId)
    if (!building) return { success: false, error: `Building not found: ${buildingId}` }

    const id = (payload.id as string) || genId('flr')
    const label = (payload.label as string) || `Floor ${building.floors.length + 1}`
    const level = (payload.level as number) ?? building.floors.length

    building.floors.push({ id, level, label, elevation: level * 4, visible: true, locked: false, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], metadata: {} })

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
        const floor = bld.floors[index]
        bld.floors.splice(index, 1)
        // Cascade: remove panoramas and QR checkpoints on this floor
        document.panoramas = document.panoramas.filter(
          p => !(p.buildingId === bld.id && p.floor === floor.level)
        )
        document.qrCheckpoints = document.qrCheckpoints.filter(
          q => !(q.buildingId === bld.id && q.floor === floor.level)
        )
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
        const newId = genId('flr')
        const newLevel = bld.floors.length
        bld.floors.push({
          id: newId,
          level: newLevel,
          label: `${sourceFloor.label} (copy)`,
          elevation: newLevel * 4,
          visible: true, locked: false,
          rooms: JSON.parse(JSON.stringify(sourceFloor.rooms.map(r => ({ ...r, id: genId('rm') })))),
          hallways: JSON.parse(JSON.stringify(sourceFloor.hallways.map(h => ({ ...h, id: genId('hw') })))),
          staircases: JSON.parse(JSON.stringify(sourceFloor.staircases.map(s => ({ ...s, id: genId('st') })))),
          elevators: JSON.parse(JSON.stringify(sourceFloor.elevators.map(e => ({ ...e, id: genId('el') })))),
          entrances: JSON.parse(JSON.stringify(sourceFloor.entrances.map(e => ({ ...e, id: genId('ent') })))),
          connectorStops: JSON.parse(JSON.stringify((sourceFloor.connectorStops || []).map(cs => ({ ...cs, id: genId('cs') })))),
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
