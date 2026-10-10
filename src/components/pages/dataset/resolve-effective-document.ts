import type { CampusDocument } from '@navi/core'
import { CoordinateTransformer } from '@navi/core'
import { createDocument } from '@navi/editor'
import type { Graph } from '@/engine/graph'

/**
 * Effective-document resolution for Dataset Management (Phase 3.2).
 *
 * Studio hydrates through EditorBridge → createEditorContext, which resolves
 * the authored document as `authoredDocument ?? createDocument(graph,
 * transformer)` — the canonical legacy graph → CampusDocument projection.
 * Dataset Management is a read-only workspace and must NOT mount the editor
 * bridge, so it performs the same two-step resolution directly through the
 * exported pure helper from `@navi/editor`:
 *
 *   1. authored document present      → use it verbatim (unchanged behaviour);
 *   2. otherwise, if the in-memory legacy graph carries authored content →
 *      project it in memory with createDocument (never persisted);
 *   3. neither                        → null (existing "not available" state).
 *
 * Persistence safety: createDocument only reads the graph (migrateAreasToPois
 * allocates new arrays; no Graph setters are touched), so rendering the
 * Dataset workspace can never mutate the store graph, trigger a save, or
 * write authored_document anywhere.
 */

function computeCentroid(points: Array<{ lat: number; lng: number }>): { lat: number; lng: number } {
  let lat = 0
  let lng = 0
  for (const p of points) {
    lat += p.lat
    lng += p.lng
  }
  return { lat: lat / points.length, lng: lng / points.length }
}

/**
 * Register transforms exactly like createEditorContext does for legacy
 * graphs (footprint-centroid origin + building rotation + identity per-floor
 * offsets) so the world↔building-local conversions inside `createDocument`
 * invert the ones GraphAdapter applied when projecting the graph.
 */
function createGraphTransformer(graph: Graph): CoordinateTransformer {
  const transformer = new CoordinateTransformer()
  for (const building of graph.buildings) {
    const footprint = Array.isArray(building.footprint) ? building.footprint : []
    const origin = footprint.length > 0 ? computeCentroid(footprint) : { lat: 0, lng: 0 }
    transformer.registerBuilding({
      buildingId: building.id,
      origin,
      rotation: building.rotation ?? 0,
    })
    for (const level of building.floors ?? []) {
      transformer.registerFloor(building.id, level, { offset: { x: 0, y: 0 }, rotation: 0 })
    }
  }
  return transformer
}

/**
 * True when any collection createDocument projects from carries content.
 * An empty graph must NOT project — it would fabricate an empty
 * CampusDocument and hide the honest "document not available" state.
 */
export function graphHasAuthoredContent(graph: Graph | null | undefined): boolean {
  if (!graph) return false
  return (
    graph.buildings.length > 0 ||
    graph.nodes.length > 0 ||
    graph.edges.length > 0 ||
    graph.components.length > 0 ||
    graph.traces.length > 0 ||
    graph.areas.length > 0 ||
    graph.pois.length > 0
  )
}

/**
 * Resolve the effective CampusDocument for the Dataset workspace:
 * authored snapshot first (canonical path), otherwise an in-memory
 * projection of the legacy graph, otherwise null.
 *
 * Pure and side-effect free — safe to call from a render-path memo.
 */
export function resolveEffectiveDatasetDocument(
  authoredDocument: CampusDocument | null,
  graph: Graph | null | undefined,
): CampusDocument | null {
  if (authoredDocument) return authoredDocument
  if (!graph || !graphHasAuthoredContent(graph)) return null
  return createDocument(graph, createGraphTransformer(graph))
}
