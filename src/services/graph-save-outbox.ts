import { fullSnapshotFingerprint } from './full-snapshot-identity'

export interface PendingGraphSave {
  version: 1
  campusId: string
  mutationId: string
  contentFingerprint: string
  expectedServerUpdatedAt: string | null
  body: string
  includedUpTo: number
  intentGeneration: string
  recovery: boolean
}
const key = (campusId: string) => `navi-graph-outbox-${campusId}`

/** Immutable logical request, separate from the latest editable recovery cache. */
export function readGraphSaveOutbox(campusId: string): PendingGraphSave | null {
  const raw = localStorage.getItem(key(campusId))
  if (!raw) return null
  try {
    const entry = JSON.parse(raw) as PendingGraphSave
    const body = JSON.parse(entry.body) as Record<string, unknown>
    if (entry.version !== 1 || entry.campusId !== campusId || body.campusId !== campusId ||
        typeof entry.mutationId !== 'string' || !entry.mutationId || body.mutationId !== entry.mutationId ||
        body.expectedServerUpdatedAt !== entry.expectedServerUpdatedAt ||
        !(entry.expectedServerUpdatedAt === null || typeof entry.expectedServerUpdatedAt === 'string') ||
        !Number.isSafeInteger(entry.includedUpTo) || entry.includedUpTo < 0 ||
        typeof entry.intentGeneration !== 'string' || typeof entry.recovery !== 'boolean' ||
        fullSnapshotFingerprint(body) !== entry.contentFingerprint) throw new Error('invalid identity')
    return entry
  } catch {
    throw new Error('Pending save recovery is unreadable. Its original bytes are preserved; resolve recovery before creating another mutation.')
  }
}

export function writeGraphSaveOutbox(entry: PendingGraphSave): void {
  const current = readGraphSaveOutbox(entry.campusId)
  if (current && (current.mutationId !== entry.mutationId || current.body !== entry.body)) {
    throw new Error('An unresolved logical save cannot be replaced by a newer payload.')
  }
  localStorage.setItem(key(entry.campusId), JSON.stringify(entry))
}

export function clearGraphSaveOutbox(campusId: string, mutationId?: string): void {
  if (mutationId && readGraphSaveOutbox(campusId)?.mutationId !== mutationId) return
  localStorage.removeItem(key(campusId))
}
