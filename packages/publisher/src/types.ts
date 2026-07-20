// ── Package Format Types (re-exported from @navi/core per ADR-012) ──

export type {
  NavNodeFile,
  NavEdgeFile,
  NavigationGraphFile,
  SearchEntryFile,
  SearchIndexFile,
  SpatialIndexFile,
  EntranceEntryFile,
  FloorEntryFile,
  BuildingEntryFile,
  BuildingIndexFile,
  POIEntryFile,
  POIIndexFile,
  PackageArtifact,
  PackageMetadata,
  NavigationPackageManifest,
} from '@navi/core'

import type {
  PackageMetadata,
  NavigationGraphFile,
  SearchIndexFile,
  SpatialIndexFile,
  BuildingIndexFile,
  POIIndexFile,
  PanoramaIndexFile,
} from '@navi/core'

// ── BuiltPackage (PackageBuilder output) ──

export interface BuiltPackage {
  campusId: string
  campusName: string
  publishedAt: string
  compilerVersion: string
  revision: string
  metadata: PackageMetadata
  graph: NavigationGraphFile
  search?: SearchIndexFile
  spatial?: SpatialIndexFile
  building?: BuildingIndexFile
  poi?: POIIndexFile
  panorama?: PanoramaIndexFile
  schemaVersions: {
    graph: string
    search: string
    spatial: string
    building: string
    poi: string
    panorama: string
  }
}

// ── Publisher Result Types (ADR-011 §4) ──

export interface PublishOptions {
  campusId: string
  campusName: string
  outputDir: string
  publishedAt?: string
  schemaVersions?: Partial<{
    graph: string
    search: string
    spatial: string
    building: string
    poi: string
    panorama: string
  }>
}

export interface ArtifactResult {
  name: string
  path: string
  checksum: string
  size: number
  schemaVersion: string
}

export interface PublisherReport {
  success: true
  path: string
  artifactCount: number
  totalBytes: number
  durationMs: number
  artifacts: ArtifactResult[]
}

export interface PublishFailure {
  success: false
  code: PublishErrorCode
  message: string
  artifact?: string
  durationMs: number
}

export type PublishResult = PublisherReport | PublishFailure

export type PublishErrorCode =
  | 'PREFLIGHT_FAILED'
  | 'SERIALIZATION_FAILED'
  | 'CHECKSUM_MISMATCH'
  | 'IO_ERROR'
  | 'COMMIT_FAILED'
