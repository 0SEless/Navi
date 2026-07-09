import type { CampusDocument, LatLng } from '@navi/core'
import type { CommandHandler, Command, MutationResult } from './types'

export const panoramaCreateHandler: CommandHandler = {
  id: 'panorama.create',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const id = (payload.id as string) || `pan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const label = (payload.label as string) || ''
    const position = payload.position as LatLng | undefined
    const heading = (payload.heading as number) ?? 0
    const imageAssetId = (payload.imageAssetId as string) || ''
    const buildingId = payload.buildingId as string | undefined
    const floor = (payload.floor as number) ?? 0

    if (!position) return { success: false, error: 'Panorama position is required' }
    if (!imageAssetId) return { success: false, error: 'Panorama imageAssetId is required' }

    document.panoramas.push({ id, label, position, heading, imageAssetId, buildingId, floor, hotspots: [] })

    return { success: true, entityId: id, data: { id } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const id = (result.data?.id as string) || payload.id as string
    return { id: 'panorama.delete', label: 'Undo Create Panorama', payload: { panoramaId: id } }
  },
}

export const panoramaDeleteHandler: CommandHandler = {
  id: 'panorama.delete',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const panoramaId = payload.panoramaId as string
    const index = document.panoramas.findIndex(p => p.id === panoramaId)
    if (index === -1) return { success: false, error: `Panorama not found: ${panoramaId}` }

    document.panoramas.splice(index, 1)
    return { success: true, entityId: panoramaId }
  },
  inverse(): Command | null {
    return null
  },
}
