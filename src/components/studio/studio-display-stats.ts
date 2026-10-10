import type { CampusMap } from '@/types/campus-map'
import type { CampusDocument } from '@navi/core'

/**
 * Display-only statistics for the Studio campus cards and dashboard
 * header (Studio statistics accuracy phase).
 *
 * Pure, deterministic, read-only, side-effect free. Never persists,
 * never migrates, never publishes. Falls back to the existing
 * `campus.stats` values whenever no trusted loaded source exists so
 * the previous UI behavior is preserved for missing data.
 */

export interface CampusDisplayStats {
  buildings: number
  nodes: number
  edges: number
}

/**
 * Minimal structural shape of a graph snapshot needed for counting.
 * The real payload of `GET /api/graph?campus_id=...` satisfies this.
 */
export interface GraphStatsSource {
  campusId?: string
  buildings?: unknown[]
  nodes?: unknown[]
  edges?: unknown[]
}

export interface CampusDisplayStatsInput {
  campus: CampusMap
  /** Authored CampusDocument when one is available (precedence A). */
  authoredDocument?: CampusDocument | null
  /** Legacy/structured graph snapshot for this campus (precedence B). */
  graph?: GraphStatsSource | null
}

/**
 * Resolve the three card statistics from the best available actual
 * campus dataset:
 *
 *   buildings: authoredDocument (authoritative structured source)
 *              else contentful legacy graph
 *              else campus.stats (existing fallback)
 *   nodes/edges: contentful legacy graph else campus.stats
 *
 * Stale graph guard (conceptual Phase 3.2 `currentMapId === routeId`
 * check): loaded data that self-identifies as a different campus is
 * ignored instead of being projected onto this campus.
 */
export function getCampusDisplayStats({
  campus,
  authoredDocument,
  graph,
}: CampusDisplayStatsInput): CampusDisplayStats {
  const fallback: CampusDisplayStats = {
    buildings: campus.stats?.buildings ?? 0,
    nodes: campus.stats?.nodes ?? 0,
    edges: campus.stats?.edges ?? 0,
  }

  const belongsToThisCampus = (dataCampusId?: string | null) =>
    dataCampusId == null || dataCampusId === campus.id

  const trustedGraph =
    graph && belongsToThisCampus(graph.campusId) ? graph : null
  const trustedDocument =
    authoredDocument && belongsToThisCampus(authoredDocument.metadata?.campusId)
      ? authoredDocument
      : null

  // An all-empty graph (e.g. the API's missing-snapshot response with
  // empty arrays) is treated as "no graph" so stale campus.stats stay
  // visible instead of being fabricated into zeros.
  const graphContentful =
    trustedGraph !== null &&
    ((trustedGraph.buildings?.length ?? 0) > 0 ||
      (trustedGraph.nodes?.length ?? 0) > 0 ||
      (trustedGraph.edges?.length ?? 0) > 0)

  let buildings = fallback.buildings
  if (trustedDocument && Array.isArray(trustedDocument.buildings)) {
    buildings = trustedDocument.buildings.length
  } else if (graphContentful && trustedGraph) {
    buildings = trustedGraph.buildings?.length ?? 0
  }

  const nodes =
    graphContentful && trustedGraph ? trustedGraph.nodes?.length ?? 0 : fallback.nodes
  const edges =
    graphContentful && trustedGraph ? trustedGraph.edges?.length ?? 0 : fallback.edges

  return { buildings, nodes, edges }
}
