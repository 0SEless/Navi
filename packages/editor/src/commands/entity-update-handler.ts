import type { CampusDocument } from '@navi/core'
import type { CommandHandler, MutationResult } from './types'

function resolveEntity(document: CampusDocument, id: string): Record<string, any> | null {
  for (const bld of document.buildings) {
    if (bld.id === id) return bld as any
    for (const flr of bld.floors) {
      if (flr.id === id) return flr as any
      for (const rm of flr.rooms) if (rm.id === id) return rm as any
      for (const hw of flr.hallways) if (hw.id === id) return hw as any
      for (const st of flr.staircases) if (st.id === id) return st as any
      for (const el of flr.elevators) if (el.id === id) return el as any
      for (const ent of flr.entrances) if (ent.id === id) return ent as any
    }
  }
  for (const rd of document.roads) if (rd.id === id) return rd as any
  for (const pan of document.panoramas) if (pan.id === id) return pan as any
  for (const qr of document.qrCheckpoints) if (qr.id === id) return qr as any
  return null
}

export const entityUpdateHandler: CommandHandler = {
  id: 'entity.update',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const entityId = payload.entityId as string
    const changes = payload.changes as Record<string, unknown> | undefined
    if (!entityId) return { success: false, error: 'entityId is required' }
    if (!changes) return { success: false, error: 'changes are required' }

    const entity = resolveEntity(document, entityId)
    if (!entity) return { success: false, error: `Entity not found: ${entityId}` }

    const oldValues: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(changes)) {
      oldValues[key] = entity[key]
      entity[key] = value
    }

    return { success: true, entityId, data: { oldValues } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): any {
    const entityId = payload.entityId as string
    const oldValues = result.data?.oldValues as Record<string, unknown>
    return {
      id: 'entity.update',
      label: 'Undo Property Edit',
      payload: { entityId, changes: oldValues },
    }
  },
}
