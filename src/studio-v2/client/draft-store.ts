// Per-part local drafts (spec §6.3): unsaved parts are kept on this computer only and
// offered back on the next open. Nothing here talks to the server.
import { parsePartKey, zoneOf, type PartKey, type ZoneKey } from '../parts/part-keys'
import type { LoadResult } from '../server/types'
import { createIndexedDbStore, type KeyValueStore } from './kv-store'

export interface V2DraftPart {
  /** Server version the edit started from; 0 for a part that did not exist yet. */
  baseVersion: number
  /** null = the part was deleted locally (unless contentBase64 is set). */
  content: unknown | null
  /** Binary parts (terrain tiles): the tile as base64; absent for JSON parts. */
  contentBase64?: string
  sortKey: string | null
}

export interface V2Draft {
  campusId: string
  userId: string
  savedAt: string
  parts: Record<PartKey, V2DraftPart>
}

export type RestoreAction = 'apply' | 'conflict-changed' | 'conflict-deleted' | 'needs-zone'
export interface RestoreDecision {
  key: PartKey
  action: RestoreAction
}

export interface DraftStore {
  write(draft: V2Draft): Promise<void>
  read(campusId: string, userId: string): Promise<V2Draft | null>
  clearParts(campusId: string, userId: string, keys: PartKey[]): Promise<void>
}

const draftKey = (campusId: string, userId: string) => `${campusId}|${userId}`

export function createDraftStore(kv: KeyValueStore<V2Draft>): DraftStore {
  return {
    async write(draft) {
      await kv.put(draftKey(draft.campusId, draft.userId), draft)
    },
    async read(campusId, userId) {
      return (await kv.get(draftKey(campusId, userId))) ?? null
    },
    async clearParts(campusId, userId, keys) {
      const key = draftKey(campusId, userId)
      const draft = await kv.get(key)
      if (!draft) return
      const parts = { ...draft.parts }
      for (const partKey of keys) delete parts[partKey]
      if (Object.keys(parts).length === 0) await kv.delete(key)
      else await kv.put(key, { ...draft, parts })
    },
  }
}

export const draftStore: DraftStore = createDraftStore(createIndexedDbStore<V2Draft>('navi-studio-v2-drafts', 'drafts'))

/**
 * Decide, per drafted part, whether it can be restored as-is (R41 precedence):
 * gone on the server since the draft's base → conflict-deleted (never silently re-created);
 * its zone is held by someone else → needs-zone; the server moved on → conflict-changed.
 */
export function planRestore(draft: V2Draft, load: LoadResult, canHoldZone: (zone: ZoneKey) => boolean): RestoreDecision[] {
  const server = new Map<PartKey, number>()
  if (load.status === 'ok') for (const part of load.parts) if (!part.deleted) server.set(part.partKey, part.versionNo)

  const decisions: RestoreDecision[] = []
  for (const key of Object.keys(draft.parts).sort()) {
    const part = draft.parts[key]
    const current = server.get(key)
    decisions.push({ key, action: decide(key, part, current, server, canHoldZone) })
  }
  return decisions
}

function decide(
  key: PartKey,
  part: V2DraftPart,
  current: number | undefined,
  server: Map<PartKey, number>,
  canHoldZone: (zone: ZoneKey) => boolean,
): RestoreAction {
  if (part.content === null && current === undefined) return 'apply'
  if (part.baseVersion > 0 && current === undefined) return 'conflict-deleted'
  if (buildingGone(key, server, part)) return 'conflict-deleted'
  const zone = zoneOf(key)
  if (zone && !canHoldZone(zone)) return 'needs-zone'
  if ((current ?? 0) !== part.baseVersion) return 'conflict-changed'
  return 'apply'
}

/** A floor whose building no longer exists cannot be restored on its own. */
function buildingGone(key: PartKey, server: Map<PartKey, number>, part: V2DraftPart): boolean {
  const parsed = parsePartKey(key)
  if (parsed.kind !== 'floor' || part.baseVersion === 0) return false
  return !server.has(`building:${encodeURIComponent(parsed.ids[0])}`)
}
