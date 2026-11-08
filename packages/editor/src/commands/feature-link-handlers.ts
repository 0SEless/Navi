// Connect / disconnect a stair or lift to the one on the floor directly below or above (2026-11-08). Both sides
// change together; undo restores the exact before state (snapshot undo: inverse() → null).
import { recordChange } from '@navi/core'
import type { CampusDocument } from '@navi/core'
import type { CommandHandler, MutationResult } from './types'
import { linkFeatures, unlinkFeature, type FeatureKind } from '../navigation/feature-links'

const kindOf = (value: unknown): FeatureKind | null => (value === 'staircase' || value === 'elevator' ? value : null)

export const featureLinkHandler: CommandHandler = {
  id: 'feature.link',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const building = document.buildings.find((b) => b.id === payload.buildingId)
    const kind = kindOf(payload.featureType)
    const lowerId = payload.lowerId as string
    const upperId = payload.upperId as string
    if (!building || !kind || !lowerId || !upperId) return { success: false, error: 'buildingId, featureType, lowerId and upperId are required' }
    const result = linkFeatures(building, kind, lowerId, upperId)
    if (!result.ok) return { success: false, error: result.error }
    recordChange(document, { entityId: lowerId, entityType: kind, operation: 'updated' })
    recordChange(document, { entityId: upperId, entityType: kind, operation: 'updated' })
    return { success: true, entityId: upperId }
  },
  inverse() {
    return null
  },
}

export const featureUnlinkHandler: CommandHandler = {
  id: 'feature.unlink',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const building = document.buildings.find((b) => b.id === payload.buildingId)
    const kind = kindOf(payload.featureType)
    const featureId = payload.featureId as string
    const side = payload.side === 'below' || payload.side === 'above' ? payload.side : null
    if (!building || !kind || !featureId || !side) return { success: false, error: 'buildingId, featureType, featureId and side are required' }
    const feature = (kind === 'staircase' ? building.staircases : building.elevators)?.find((f) => f.id === featureId)
    if (!feature) return { success: false, error: `Not found: ${featureId}` }
    const partner = feature.links?.[side]
    unlinkFeature(building, kind, featureId, side)
    recordChange(document, { entityId: featureId, entityType: kind, operation: 'updated' })
    if (partner) recordChange(document, { entityId: partner, entityType: kind, operation: 'updated' })
    return { success: true, entityId: featureId }
  },
  inverse() {
    return null
  },
}
