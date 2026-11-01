// Floor-plan images as a private, local tracing reference (spec §6.6). The image and its
// alignment live only in this browser; they are never sent to the server.
import type { CampusDocument } from '@navi/core'
import type { LocalFloorReference } from '../parts/split'
import { createIndexedDbStore, type KeyValueStore } from './kv-store'

export interface LocalReferenceEntry {
  /** The uploaded (PDF-rasterised) image. */
  blob?: Blob
  /** Fallback when only a URL is known (e.g. an older in-memory plan). */
  imageUrl?: string
  planAlignment?: unknown
  floorPlanState?: 'none' | 'active' | 'locked'
}

export interface LocalReferenceStore {
  put(campusId: string, buildingId: string, floorId: string, entry: LocalReferenceEntry): Promise<void>
  get(campusId: string, buildingId: string, floorId: string): Promise<LocalReferenceEntry | null>
  remove(campusId: string, buildingId: string, floorId: string): Promise<void>
  /** Re-attach stored references to the document's floors (sets planImageId to an object URL). */
  attach(doc: CampusDocument, campusId: string): Promise<CampusDocument>
  /** Store alignment/state edits taken from splitDocument().localReferences. */
  syncFrom(refs: LocalFloorReference[], campusId: string): Promise<void>
}

const referenceKey = (campusId: string, buildingId: string, floorId: string) => `${campusId}|${buildingId}|${floorId}`

export function createLocalReferenceStore(
  kv: KeyValueStore<LocalReferenceEntry>,
  objectUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
): LocalReferenceStore {
  return {
    async put(campusId, buildingId, floorId, entry) {
      await kv.put(referenceKey(campusId, buildingId, floorId), entry)
    },
    async get(campusId, buildingId, floorId) {
      return (await kv.get(referenceKey(campusId, buildingId, floorId))) ?? null
    },
    async remove(campusId, buildingId, floorId) {
      await kv.delete(referenceKey(campusId, buildingId, floorId))
    },
    async attach(doc, campusId) {
      for (const building of doc.buildings) {
        for (const floor of building.floors) {
          const entry = await kv.get(referenceKey(campusId, building.id, floor.id))
          if (!entry) continue
          const url = entry.blob ? objectUrl(entry.blob) : entry.imageUrl
          if (url) floor.planImageId = url
          if (entry.planAlignment !== undefined) floor.planAlignment = entry.planAlignment as typeof floor.planAlignment
          if (entry.floorPlanState !== undefined) floor.floorPlanState = entry.floorPlanState
        }
      }
      return doc
    },
    async syncFrom(refs, campusId) {
      for (const ref of refs) {
        const key = referenceKey(campusId, ref.buildingId, ref.floorId)
        const existing = (await kv.get(key)) ?? {}
        const next: LocalReferenceEntry = { ...existing }
        if (ref.planAlignment !== undefined) next.planAlignment = ref.planAlignment
        if (ref.floorPlanState !== undefined) next.floorPlanState = ref.floorPlanState
        if (!existing.blob && !existing.imageUrl && ref.planImageId) next.imageUrl = ref.planImageId
        await kv.put(key, next)
      }
    },
  }
}

export const localReferenceStore: LocalReferenceStore = createLocalReferenceStore(
  createIndexedDbStore<LocalReferenceEntry>('navi-studio-floor-references', 'references'),
)
