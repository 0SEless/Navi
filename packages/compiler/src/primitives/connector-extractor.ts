import type { PrimitiveContribution, NormalizedDocument, GenerationContext, NormalizedFeatureLevels } from '../types'
import { nextCompilerId as nextId } from '../ids'


/**
 * ConnectorExtractor produces Transition nodes for vertical movement:
 *  1. Legacy path: one node per ConnectorStop, grouped by connectorId
 *     (pairing happens in Phase 2.3).
 *  2. P1-T9 (R2.6/D19): levels-based stair/elevator features emit ONE node
 *     per ACCESS floor present in `levels` (absent floors simply absent,
 *     never zero-filled), at that floor's OWN placement, connectorId =
 *     feature id. When a building carries feature staircases/elevators, the
 *     legacy connector-stop path for stair/elevator connectors is SKIPPED
 *     (features are authoritative — no duplicate stair nodes).
 */
export function extractConnectors(document: NormalizedDocument, _context: GenerationContext): PrimitiveContribution {
  const nodes = []

  for (const building of document.buildings) {
    const hasFeatureStairs = (building.staircases ?? []).length > 0
    const hasFeatureElevators = (building.elevators ?? []).length > 0

    // Legacy connector stops (suppressed per-connector when features exist)
    for (const floor of building.floors) {
      for (const stop of floor.connectorStops) {
        if (hasFeatureStairs && stop.behavior === 'stairs') continue
        if (hasFeatureElevators && stop.behavior === 'elevator') continue
        const id = nextId('T')
        nodes.push({
          id,
          kind: 'transition' as const,
          position: stop.position,
          floor: stop.floor,
          buildingId: building.id,
          connectorId: stop.connectorId,
          stopId: stop.id,
          behavior: stop.behavior,
          accessible: stop.accessible,
          baseCost: stop.baseCost,
          source: {
            entityId: stop.id,
            entityType: 'connector_stop',
            field: 'position',
            generatorId: 'builtin:connector-extractor',
          },
        })
      }
    }

    // Linked stairs / lifts (2026-11-08): items drawn on separate floors and linked floor to floor form one chain, named
    // after its bottom item, so the floor pairing below joins them like one multi-floor stair.
    const stairChain = chainRoots(building.staircases ?? [])
    const liftChain = chainRoots(building.elevators ?? [])
    // P1-T9: feature levels → one transition node per access floor
    for (const st of building.staircases ?? []) {
      for (const [levelKey, geom] of Object.entries(st.levels)) {
        const level = Number(levelKey)
        if (!Number.isInteger(level)) continue
        nodes.push({
          id: nextId('T'),
          kind: 'transition' as const,
          position: geom.position,
          floor: level,
          buildingId: building.id,
          connectorId: stairChain.get(st.id) ?? st.id,
          behavior: 'stairs',
          accessible: st.accessible,
          baseCost: 15,
          source: {
            entityId: st.id,
            entityType: 'staircase',
            field: 'position',
            generatorId: 'builtin:connector-extractor',
          },
        })
      }
    }
    for (const el of building.elevators ?? []) {
      for (const [levelKey, geom] of Object.entries(el.levels)) {
        const level = Number(levelKey)
        if (!Number.isInteger(level)) continue
        nodes.push({
          id: nextId('T'),
          kind: 'transition' as const,
          position: geom.position,
          floor: level,
          buildingId: building.id,
          connectorId: liftChain.get(el.id) ?? el.id,
          behavior: 'elevator',
          accessible: el.accessible,
          baseCost: 20,
          source: {
            entityId: el.id,
            entityType: 'elevator',
            field: 'position',
            generatorId: 'builtin:connector-extractor',
          },
        })
      }
    }
  }

  return { nodes }
}
/**
 * The bottom item of each item's linked chain. A link counts only when its partner exists, links back, and sits on
 * the floor directly below (partner's top floor + 1 = this item's lowest floor); anything else starts a new chain.
 */
function chainRoots(items: NormalizedFeatureLevels[]): Map<string, string> {
  const byId = new Map(items.map((item) => [item.id, item]))
  const floors = (item: NormalizedFeatureLevels) => Object.keys(item.levels).map(Number).filter(Number.isInteger)
  const lowest = (item: NormalizedFeatureLevels) => Math.min(...floors(item))
  const highest = (item: NormalizedFeatureLevels) => Math.max(...floors(item))
  const below = (item: NormalizedFeatureLevels): NormalizedFeatureLevels | undefined => {
    const partner = item.links?.below ? byId.get(item.links.below) : undefined
    if (!partner || partner.links?.above !== item.id || floors(partner).length === 0 || floors(item).length === 0) return undefined
    return highest(partner) + 1 === lowest(item) ? partner : undefined
  }
  const roots = new Map<string, string>()
  for (const item of items) {
    let root = item
    const seen = new Set<string>([item.id])
    for (let next = below(root); next && !seen.has(next.id); next = below(root)) {
      seen.add(next.id)
      root = next
    }
    roots.set(item.id, root.id)
  }
  return roots
}
