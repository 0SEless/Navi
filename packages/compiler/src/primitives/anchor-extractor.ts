import type { PrimitiveContribution, NormalizedDocument, GenerationContext } from '../types'
import { nextCompilerId as nextId } from '../ids'


export function extractAnchors(document: NormalizedDocument, _context: GenerationContext): PrimitiveContribution {
  const nodes = []

  for (const building of document.buildings) {
    for (const floor of building.floors) {
      for (const anchor of floor.anchors) {
        const id = nextId('POI')
        nodes.push({
          id,
          kind: 'poi' as const,
          label: anchor.label || `${anchor.type} anchor`,
          position: anchor.position,
          floor: floor.level,
          buildingId: building.id,
          poiCategory: anchor.type === 'panorama' ? 'panorama' : 'qr_marker',
          source: {
            entityId: anchor.id,
            entityType: 'anchor',
            field: 'position',
            generatorId: 'builtin:anchor-extractor',
          },
        })
      }
    }
  }

  return { nodes }
}
