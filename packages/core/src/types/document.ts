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

export interface CampusDocument {
  schemaVersion: number  // currently 1
  metadata: DocumentMetadata
  buildings: Building[]
  roads: Road[]
  panoramas: Panorama[]
  qrCheckpoints: QRCheckpoint[]
}
