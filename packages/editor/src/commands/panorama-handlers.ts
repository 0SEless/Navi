import { recordChange } from '@navi/core'
import type { CampusDocument, LocalCoord, LatLng, Panorama } from '@navi/core'
import type { CommandHandler, Command, MutationResult } from './types'
import { genId } from '../id'

/**
 * Panorama authoring commands.
 *
 * ADR 023 — the panorama/route-node association is DERIVED, never authored.
 * `Panorama` (packages/core/src/types/entities.ts) deliberately carries NO
 * node-reference field. These handlers therefore never create, store, or mutate
 * a route-node link; `GraphAdapter.sync()` regenerates the synthetic node from
 * the entity, and deleting/restoring the entity regenerates (or removes) it
 * naturally. There is no link/unlink command by design.
 *
 * The entity is also the only place panorama identity lives. `imageAssetId` is
 * the R2 object key and may legitimately be '' until an upload completes.
 */
export const panoramaCreateHandler: CommandHandler = {
  id: 'panorama.create',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const id = (payload.id as string) || genId('pan')
    const label = (payload.label as string) || ''
    // D9 coordinate semantics:
    // - When buildingId is present: position is LocalCoord (building-local meters)
    // - When buildingId is absent: position is LatLng (world coordinates)
    const position = payload.position as LocalCoord | LatLng | undefined
    const heading = (payload.heading as number) ?? 0
    const imageAssetId = (payload.imageAssetId as string) || ''
    const buildingId = payload.buildingId as string | undefined

    if (!position) return { success: false, error: 'Panorama position is required' }
    // Option 1 contract (Phase 2A/2B): imageAssetId may be '' before upload.
    // The Image Asset control attaches the key later via entity.update.

    // Validate coordinate system matches buildingId
    const isLatLng = (position as unknown as { lat?: number }).lat !== undefined
    if (buildingId && isLatLng) {
      return { success: false, error: 'Building-associated panorama must use LocalCoord (building-local meters), not LatLng' }
    }
    if (!buildingId && !isLatLng) {
      return { success: false, error: 'Outdoor panorama (no buildingId) must use LatLng (world coordinates), not LocalCoord' }
    }

    // D9 floor semantics (PM-1):
    // - Outdoor panoramas are campus-wide and have no floor by definition, so
    //   floor stays undefined. A supplied floor is meaningless here and is
    //   normalised away rather than persisted as a lie.
    // - Building panoramas keep the supplied floor verbatim. `0` is real
    //   ground-floor DATA, never a stand-in for "unset", so it is preserved.
    const floor = buildingId ? (payload.floor as number | undefined) : undefined

    document.panoramas.push({ id, label, position, heading, imageAssetId, buildingId, floor, hotspots: [] })

    recordChange(document, { entityId: id, entityType: 'panorama', operation: 'created' })
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

    const [removed] = document.panoramas.splice(index, 1)
    recordChange(document, { entityId: panoramaId, entityType: 'panorama', operation: 'deleted' })
    // Capture the whole entity so undo can restore it byte-for-byte. The derived
    // route node is NOT captured: it is a projection and is regenerated from the
    // restored entity by the next GraphAdapter.sync() (ADR 023).
    return {
      success: true,
      entityId: panoramaId,
      data: { removedPanorama: structuredClone(removed), index },
    }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    if (!result.data?.removedPanorama) return null
    return {
      id: 'panorama.restore',
      label: 'Undo Delete Panorama',
      payload: { panorama: result.data.removedPanorama, index: result.data.index },
    }
  },
}

/**
 * Reinstates a previously deleted `Panorama` verbatim (ADR 023).
 *
 * Deliberately distinct from `panorama.create`: create normalises a payload into
 * a brand-new entity (empty hotspots, generated id), whereas restore must put
 * back the exact prior value — heading, imageAssetId, hotspots and all — so undo
 * is lossless.
 */
export const panoramaRestoreHandler: CommandHandler = {
  id: 'panorama.restore',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const panorama = payload.panorama as Panorama | undefined
    if (!panorama || typeof panorama.id !== 'string' || panorama.id === '') {
      return { success: false, error: 'Panorama is required for restore' }
    }
    if (document.panoramas.some(p => p.id === panorama.id)) {
      return { success: false, error: `Panorama already exists: ${panorama.id}` }
    }

    const requested = payload.index
    const index =
      typeof requested === 'number' && requested >= 0 && requested <= document.panoramas.length
        ? requested
        : document.panoramas.length

    // Deep copy so later entity edits cannot mutate the captured command payload.
    document.panoramas.splice(index, 0, structuredClone(panorama))
    recordChange(document, { entityId: panorama.id, entityType: 'panorama', operation: 'created' })
    return { success: true, entityId: panorama.id, data: { id: panorama.id } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const panorama = payload.panorama as Panorama | undefined
    const id = (result.data?.id as string) || panorama?.id
    if (!id) return null
    return { id: 'panorama.delete', label: 'Undo Restore Panorama', payload: { panoramaId: id } }
  },
}
