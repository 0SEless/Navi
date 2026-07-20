import type {
  NormalizedDocument,
  PrimitiveGraph,
  CompilerDiagnostic,
  GenerationContext,
  PrimitiveNode,
  PrimitiveEdge,
} from '../types'
import { extractRooms } from './room-extractor'
import { extractDoors } from './door-extractor'
import { extractAnchors } from './anchor-extractor'
import { extractConnectors } from './connector-extractor'
import { extractEntrances } from './entrance-extractor'
import { PolylineSkeletonGenerator } from './skeleton-generator'
import { connectPrimitives } from './connector'

/**
 * PrimitiveCoordinator
 *
 * Orchestrates Stage 2 (Generate Primitives):
 *   Phase 2.1 — Extract Sources (extractors, independent)
 *   Phase 2.2 — Skeletonize (polyline sampling)
 *   Phase 2.3 — Connect & Resolve (nearest-waypoint, pairing, portal edges)
 *
 * Extractor invocation order: Room → Door → Anchor → Connector → Entrance.
 * Order is deterministic — changing it would change node IDs.
 */
export function generatePrimitives(
  document: NormalizedDocument,
  context: GenerationContext,
): PrimitiveGraph {
  const allDiagnostics: CompilerDiagnostic[] = []
  let allNodes: PrimitiveNode[] = []
  let allEdges: PrimitiveEdge[] = []

  const extractors = [
    { name: 'room', fn: extractRooms },
    { name: 'door', fn: extractDoors },
    { name: 'anchor', fn: extractAnchors },
    { name: 'connector', fn: extractConnectors },
    { name: 'entrance', fn: extractEntrances },
  ]

  // Phase 2.1: Run extractors, merge contributions
  let doorSpecs: Array<{ roomId: string; doorId: string; position: { lat: number; lng: number }; floor: number; buildingId: string; width?: number; properties?: Record<string, unknown> }> = []

  for (const { name, fn } of extractors) {
    const contribution = fn(document, context)
    if (contribution.nodes) allNodes.push(...contribution.nodes)
    if (contribution.edges) allEdges.push(...contribution.edges)
    if (contribution.diagnostics) allDiagnostics.push(...contribution.diagnostics)
    if (contribution.doorSpecs) doorSpecs = contribution.doorSpecs
  }

  // Phase 2.2: Skeletonize
  const skeleton = new PolylineSkeletonGenerator()
  const skeletonContrib = skeleton.generate(document, context)
  if (skeletonContrib.nodes) allNodes.push(...skeletonContrib.nodes)
  if (skeletonContrib.edges) allEdges.push(...skeletonContrib.edges)
  if (skeletonContrib.diagnostics) allDiagnostics.push(...skeletonContrib.diagnostics)

  // Build partial PrimitiveGraph for Phase 2.3
  const primitiveGraph: PrimitiveGraph = {
    nodes: allNodes,
    edges: allEdges,
    metadata: {
      campusId: '',
      buildingCount: document.buildings.length,
      floorCount: document.buildings.reduce((s, b) => s + b.floors.length, 0),
      generatedAt: 0,
    },
    diagnostics: allDiagnostics,
  }

  // Phase 2.3: Connect & Resolve
  const connection = connectPrimitives(primitiveGraph, doorSpecs)
  allEdges.push(...connection.edges)
  allDiagnostics.push(...connection.diagnostics)

  // Count buildings/floors from the document
  const buildingIds = new Set(document.buildings.map(b => b.id))
  const floorKeys = new Set<string>()
  for (const b of document.buildings) {
    for (const f of b.floors) floorKeys.add(`${b.id}-${f.level}`)
  }

  return {
    nodes: allNodes,
    edges: allEdges,
    metadata: {
      campusId: '',
      buildingCount: buildingIds.size,
      floorCount: floorKeys.size,
      generatedAt: 0,
    },
    diagnostics: allDiagnostics,
  }
}
