import type { PrimitiveContribution, NormalizedDocument, GenerationContext } from '../types'

let seqId = 0
function nextId(prefix: string): string {
  return `${prefix}-${++seqId}`
}

/**
 * ConnectorExtractor produces Transition nodes from ConnectorStops grouped by connectorId.
 * Does NOT pair stops — pairing happens in Phase 2.3.
 */
export function extractConnectors(document: NormalizedDocument, _context: GenerationContext): PrimitiveContribution {
  const nodes = []

  for (const building of document.buildings) {
    for (const floor of building.floors) {
      for (const stop of floor.connectorStops) {
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
  }

  return { nodes }
}
