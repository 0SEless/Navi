import type {
  NavigationPackageManifest,
} from '@navi/core'
import type {
  NavigationGraph,
  SearchIndex,
  BuildingIndex,
  POIIndex,
  PanoramaIndex,
} from '@navi/core'

// ── LoadedPackage (ADR-012 §3) — runtime-ready types ──

export interface LoadedPackage {
  readonly manifest: NavigationPackageManifest
  readonly graph: NavigationGraph
  readonly searchIndex?: SearchIndex
  readonly buildingIndex?: BuildingIndex
  readonly poiIndex?: POIIndex
  readonly panoramaIndex?: PanoramaIndex
  readonly reports: readonly ArtifactReport[]
}

// ── LoadResult (ADR-012 §2) ──

export type LoadResult = LoadReport | LoadFailure

export interface LoadReport {
  readonly success: true
  readonly package: LoadedPackage
  readonly durationMs: number
}

export interface LoadFailure {
  readonly success: false
  readonly code: LoadErrorCode
  readonly message: string
  readonly durationMs: number
}

export type LoadErrorCode =
  | 'PACKAGE_NOT_FOUND'
  | 'MISSING_MANIFEST'
  | 'INVALID_MANIFEST'
  | 'CHECKSUM_MISMATCH'
  | 'INVALID_SCHEMA'
  | 'INVALID_REFERENCE'
  | 'IO_ERROR'

// ── Artifact Reports (per-artifact tracking) ──

export type ArtifactReport = LoadedArtifact | SkippedArtifact | FailedArtifact

export interface LoadedArtifact {
  readonly status: 'LOADED'
  readonly artifactType: string
  readonly data: unknown
}

export interface SkippedArtifact {
  readonly status: 'SKIPPED'
  readonly artifactType: string
  readonly reason: string
}

export interface FailedArtifact {
  readonly status: 'FAILED'
  readonly artifactType: string
  readonly code: string
  readonly message: string
}


