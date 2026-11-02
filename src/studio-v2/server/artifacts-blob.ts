// The published artifacts blob: the object stored as a publication's artifacts and read by
// NAVI Web. Extracted verbatim from the legacy publish route (src/app/api/publish/route.ts)
// so the legacy publish and the Save v2 publish write exactly the same shape. Any change
// here changes what the public map receives.

export interface PublishArtifactsPayload {
  navigationGraph?: Record<string, unknown>
  searchIndex?: unknown
  poiData?: unknown
  buildingIndex?: unknown
  spatialIndex?: unknown
  panoramaIndex?: unknown
  floorGeometry?: unknown
  qrIndex?: unknown
  terrainAreas?: unknown
  terrainVerticalDatum?: unknown
  /** Terrain plan: the campus-only site package (SiteArtifact); absent when the campus has no boundary. */
  site?: unknown
  components?: unknown
  doors?: unknown
  metadata?: unknown
  [key: string]: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** The artifact metadata object, or {} when it is missing or not an object. */
export function artifactMetadataOf(artifacts: PublishArtifactsPayload): Record<string, unknown> {
  return isRecord(artifacts.metadata) ? artifacts.metadata : {}
}

/** metadata.compilerVersion, else the graph version, else '1.0.0'. */
export function resolveCompilerVersion(artifacts: PublishArtifactsPayload): string {
  const artifactMetadata = artifactMetadataOf(artifacts)
  return typeof artifactMetadata.compilerVersion === 'string' && artifactMetadata.compilerVersion.length > 0
    ? artifactMetadata.compilerVersion
    : typeof artifacts.navigationGraph?.version === 'string'
      ? artifacts.navigationGraph.version
      : '1.0.0'
}

/** metadata.compiledAt, else the graph createdAt, else now. */
function resolveCompiledAt(artifacts: PublishArtifactsPayload): string {
  const artifactMetadata = artifactMetadataOf(artifacts)
  return typeof artifactMetadata.compiledAt === 'string' && artifactMetadata.compiledAt.length > 0
    ? artifactMetadata.compiledAt
    : typeof artifacts.navigationGraph?.createdAt === 'string'
      ? artifacts.navigationGraph.createdAt
      : new Date().toISOString()
}

/**
 * Builds the published blob from compile-route-shaped artifacts.
 * `revision` is the published bundle sequence; `sourceRevision` is the compiler source
 * provenance (null falls back to `revision`). Both are stored as strings.
 */
export function buildArtifactsBlob(
  artifacts: PublishArtifactsPayload,
  campusId: string,
  revision: number,
  sourceRevision: number | null,
): Record<string, unknown> {
  const artifactMetadata = artifactMetadataOf(artifacts)
  const compilerVersion = resolveCompilerVersion(artifacts)
  const compiledAt = resolveCompiledAt(artifacts)
  return {
    graph: artifacts.navigationGraph,
    searchIndex: artifacts.searchIndex ?? { version: '1.0.0', entries: [] },
    buildingIndex: artifacts.buildingIndex ?? { version: '1.0.0', buildings: [] },
    poiIndex: artifacts.poiData ?? { version: '1.0.0', points: [] },
    spatialIndex: artifacts.spatialIndex ?? null,
    panoramaIndex: artifacts.panoramaIndex ?? null,
    floorGeometry: artifacts.floorGeometry ?? null,
    qrIndex: artifacts.qrIndex ?? null,
    ...(artifacts.terrainAreas !== undefined ? { terrainAreas: artifacts.terrainAreas } : {}),
    ...(artifacts.terrainVerticalDatum !== undefined ? { terrainVerticalDatum: artifacts.terrainVerticalDatum } : {}),
    ...(artifacts.site !== undefined ? { site: artifacts.site } : {}),
    components: Array.isArray(artifacts.components) ? artifacts.components : [],
    doors: Array.isArray(artifacts.doors) ? artifacts.doors : [],
    metadata: {
      ...artifactMetadata,
      campusId,
      ...(typeof artifactMetadata.connectivitySemanticsVersion === 'string'
        ? { connectivitySemanticsVersion: artifactMetadata.connectivitySemanticsVersion }
        : {}),
      compilerVersion,
      revision: String(revision),
      sourceDocumentVersion: String(sourceRevision ?? revision),
      compiledAt,
    },
  }
}
