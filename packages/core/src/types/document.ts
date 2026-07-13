import type { Building } from './entities'
import type { Road } from './entities'
import type { Panorama } from './entities'
import type { QRCheckpoint } from './entities'

export interface DocumentMetadata {
  name: string
  description: string
  lastModified: string  // ISO timestamp
  editorVersion: string // NAVI Studio version that last saved
}

export interface EntityChange {
  readonly entityId: string
  readonly entityType: string
  readonly operation: 'created' | 'updated' | 'deleted'
}

export interface CampusDocument {
  schemaVersion: number  // currently 1
  version: number        // monotonic version counter, incremented on every change
  metadata: DocumentMetadata
  buildings: Building[]
  roads: Road[]
  panoramas: Panorama[]
  qrCheckpoints: QRCheckpoint[]
  /** Runtime-only change journal. Not serialized. Populated during editing sessions. */
  _changeJournal?: EntityChange[]
}

/** Record a change and bump the document version. */
export function recordChange(document: CampusDocument, change: EntityChange): void {
  if (!document._changeJournal) {
    document._changeJournal = []
  }
  document._changeJournal.push(change)
  document.version++
}

/**
 * Return all changes recorded since the given version.
 * Non-destructive — multiple callers can query independently.
 */
export function getChangesSince(document: CampusDocument, version: number): readonly EntityChange[] {
  if (!document._changeJournal || version >= document.version) return []
  const startIndex = Math.max(0, version)
  return document._changeJournal.slice(startIndex)
}
