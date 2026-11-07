// The campus body NAVI Web reads from /api/public-campus for a publication's artifacts. Shared with the Studio
// preview (2026-11-07), so a preview shows exactly what visitors will get after Publish.

type AnyRecord = Record<string, unknown>

const isRecord = (value: unknown): value is AnyRecord => typeof value === 'object' && value !== null && !Array.isArray(value)
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

export function resolveCampusDisplayName(campusId: string, ...values: unknown[]): string | null {
  for (const value of values) {
    if (!isNonEmptyString(value)) continue
    const name = value.trim()
    if (name !== campusId) return name
  }
  return null
}

export interface PublicCampusPayload {
  campusId: string
  campusName: string | null
  source: string
  revision: string | number | null
  buildings: unknown[]
  components: unknown[]
  doors: unknown[]
  nodes: unknown[]
  edges: unknown[]
  traces: unknown[]
  pois: unknown[]
  boundary: unknown
  artifacts: unknown
}

/** The /api/public-campus body for a published (or previewed) artifacts blob. */
export function publicCampusPayload(campusId: string, artifacts: AnyRecord, source = 'published_maps'): PublicCampusPayload {
  const graph = isRecord(artifacts.graph) ? artifacts.graph : {}
  const metadata = isRecord(artifacts.metadata) ? artifacts.metadata : {}
  const buildingIndex = isRecord(artifacts.buildingIndex) ? artifacts.buildingIndex : {}
  const poiIndex = isRecord(artifacts.poiIndex) ? artifacts.poiIndex : {}
  const graphMetadata = isRecord(graph.metadata) ? graph.metadata : {}
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
  return {
    campusId,
    campusName: resolveCampusDisplayName(campusId, artifacts.campusName, artifacts.name, metadata.campusName, metadata.name),
    source,
    revision: (metadata.revision as string | number | undefined) ?? null,
    buildings: list(buildingIndex.buildings),
    // Components and doors are additive compiler projections; older publications may not have them.
    components: list(artifacts.components),
    doors: list(artifacts.doors),
    nodes: list(graph.nodes),
    edges: list(graph.edges),
    traces: list(graph.traces),
    pois: Array.isArray(poiIndex.points) ? poiIndex.points : list(graph.pois),
    boundary: graphMetadata.boundingBox ?? null,
    artifacts,
  }
}
