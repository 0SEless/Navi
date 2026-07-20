import { recordChange } from '@navi/core'
import type { CampusDocument, LatLng } from '@navi/core'
import type { CommandHandler, Command, MutationResult } from './types'
import { genId } from '../id'

export const qrCreateHandler: CommandHandler = {
  id: 'qr.create',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const id = (payload.id as string) || genId('qr')
    const label = (payload.label as string) || ''
    const position = payload.position as LatLng | undefined
    const floor = (payload.floor as number) ?? 0
    const buildingId = (payload.buildingId as string) || ''
    const code = (payload.code as string) || ''

    if (!position) return { success: false, error: 'QR checkpoint position is required' }
    if (!code) return { success: false, error: 'QR code content is required' }

    document.qrCheckpoints.push({ id, label, position, floor, buildingId, code, metadata: {} })

    recordChange(document, { entityId: id, entityType: 'checkpoint', operation: 'created' })
    return { success: true, entityId: id, data: { id } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const id = (result.data?.id as string) || payload.id as string
    return { id: 'qr.delete', label: 'Undo Create QR', payload: { qrId: id } }
  },
}

export const qrDeleteHandler: CommandHandler = {
  id: 'qr.delete',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const qrId = payload.qrId as string
    const index = document.qrCheckpoints.findIndex(q => q.id === qrId)
    if (index === -1) return { success: false, error: `QR checkpoint not found: ${qrId}` }

    document.qrCheckpoints.splice(index, 1)
    recordChange(document, { entityId: qrId, entityType: 'checkpoint', operation: 'deleted' })
    return { success: true, entityId: qrId }
  },
  inverse(): Command | null {
    return null
  },
}
