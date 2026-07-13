import { recordChange } from '@navi/core'
import type { CampusDocument, LatLng, RoadSurface, RoadType } from '@navi/core'
import type { CommandHandler, Command, MutationResult } from './types'

export const roadCreateHandler: CommandHandler = {
  id: 'road.create',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const id = (payload.id as string) || `rd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const name = (payload.name as string) || ''
    const points = payload.points as LatLng[] | undefined
    const width = (payload.width as number) || 5
    const surface = (payload.surface as RoadSurface) || 'paved'
    const type = (payload.type as RoadType) || 'service'

    if (!points || points.length < 2) {
      return { success: false, error: 'Road polyline must have at least 2 points' }
    }

    document.roads.push({ id, name, polyline: { points }, width, surface, type, metadata: {} })

    recordChange(document, { entityId: id, entityType: 'road', operation: 'created' })
    return { success: true, entityId: id, data: { id } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const id = (result.data?.id as string) || payload.id as string
    return { id: 'road.delete', label: 'Undo Create Road', payload: { roadId: id } }
  },
}

export const roadRenameHandler: CommandHandler = {
  id: 'road.rename',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const roadId = payload.roadId as string
    const newName = payload.name as string
    const road = document.roads.find(r => r.id === roadId)
    if (!road) return { success: false, error: `Road not found: ${roadId}` }

    const oldName = road.name
    road.name = newName

    recordChange(document, { entityId: roadId, entityType: 'road', operation: 'updated' })
    return { success: true, entityId: roadId, data: { oldName } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    return {
      id: 'road.rename',
      label: 'Undo Rename Road',
      payload: { roadId: payload.roadId as string, name: result.data?.oldName as string },
    }
  },
}

export const roadDeleteHandler: CommandHandler = {
  id: 'road.delete',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const roadId = payload.roadId as string
    const index = document.roads.findIndex(r => r.id === roadId)
    if (index === -1) return { success: false, error: `Road not found: ${roadId}` }

    document.roads.splice(index, 1)
    recordChange(document, { entityId: roadId, entityType: 'road', operation: 'deleted' })
    return { success: true, entityId: roadId }
  },
  inverse(): Command | null {
    return null
  },
}
