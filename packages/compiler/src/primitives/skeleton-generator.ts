import type { LatLng } from '@navi/core'
import { haversineDistance } from '@navi/core'
import type {
  SkeletonGenerator,
  NormalizedDocument,
  PrimitiveContribution,
  GenerationContext,
  PrimitiveNode,
  PrimitiveEdge,
  CompilerDiagnostic,
} from '../types'

let seqId = 0
function nextId(prefix: string): string {
  return `${prefix}-${++seqId}`
}

function samplePolyline(polyline: LatLng[], interval: number): { waypoints: PrimitiveNode[]; edges: PrimitiveEdge[] } {
  const waypoints: PrimitiveNode[] = []
  const edges: PrimitiveEdge[] = []

  if (polyline.length === 0) return { waypoints, edges }

  let prevId = nextId('W')
  waypoints.push({
    id: prevId,
    kind: 'waypoint',
    position: polyline[0],
    floor: 0,
    buildingId: '',
    source: { entityId: '', entityType: 'skeleton', generatorId: 'builtin:polyline-skeleton' },
  })

  let accumulated = 0

  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1]
    const b = polyline[i]
    const segLen = haversineDistance(a, b)

    if (segLen === 0) continue

    let pos = interval - accumulated
    while (pos < segLen) {
      const t = pos / segLen
      const lat = a.lat + (b.lat - a.lat) * t
      const lng = a.lng + (b.lng - a.lng) * t
      const id = nextId('W')
      waypoints.push({
        id,
        kind: 'waypoint',
        position: { lat, lng },
        floor: 0,
        buildingId: '',
        source: { entityId: '', entityType: 'skeleton', generatorId: 'builtin:polyline-skeleton' },
      })
      edges.push({
        id: nextId('SE'),
        kind: 'skeleton',
        from: prevId,
        to: id,
        distance: haversineDistance(waypoints[waypoints.length - 2].position, { lat, lng }),
        source: { entityId: '', entityType: 'skeleton', generatorId: 'builtin:polyline-skeleton' },
      })
      prevId = id
      pos += interval
    }
    accumulated = pos - segLen
  }

  if (waypoints.length > 0) {
    const lastPos = polyline[polyline.length - 1]
    if (haversineDistance(waypoints[waypoints.length - 1].position, lastPos) > 0.01) {
      const id = nextId('W')
      waypoints.push({
        id,
        kind: 'waypoint',
        position: lastPos,
        floor: 0,
        buildingId: '',
        source: { entityId: '', entityType: 'skeleton', generatorId: 'builtin:polyline-skeleton' },
      })
      edges.push({
        id: nextId('SE'),
        kind: 'skeleton',
        from: prevId,
        to: id,
        distance: haversineDistance(waypoints[waypoints.length - 2].position, lastPos),
        source: { entityId: '', entityType: 'skeleton', generatorId: 'builtin:polyline-skeleton' },
      })
    }
  }

  return { waypoints, edges }
}

export class PolylineSkeletonGenerator implements SkeletonGenerator {
  readonly id = 'builtin:polyline-skeleton'

  generate(
    document: NormalizedDocument,
    context: GenerationContext,
  ): PrimitiveContribution {
    const nodes: PrimitiveNode[] = []
    const edges: PrimitiveEdge[] = []
    const diagnostics: CompilerDiagnostic[] = []
    const interval = context.nodeInterval || 2

    for (const building of document.buildings) {
      for (const floor of building.floors) {
        for (const hallway of floor.hallways) {
          const { waypoints, edges: skeletonEdges } = samplePolyline(hallway.polyline, interval)

          for (const wp of waypoints) {
            wp.floor = floor.level
            wp.buildingId = building.id
            wp.source = {
              entityId: hallway.id,
              entityType: 'hallway',
              field: 'polyline',
              generatorId: 'builtin:polyline-skeleton',
            }
          }
          for (const e of skeletonEdges) {
            e.source = {
              entityId: hallway.id,
              entityType: 'hallway',
              field: 'polyline',
              generatorId: 'builtin:polyline-skeleton',
            }
          }

          nodes.push(...waypoints)
          edges.push(...skeletonEdges)

          if (waypoints.length === 0) {
            diagnostics.push({
              severity: 'warning',
              sourceEntityId: hallway.id,
              phase: 'primitives',
              code: 'HALLWAY_EMPTY',
              message: `Hallway "${hallway.name}" produced no waypoints`,
            })
          }
        }
      }
    }

    for (const road of document.roads) {
      const { waypoints, edges: roadEdges } = samplePolyline(road.polyline, interval)

      const syntheticBuildingId = '__outdoor__'
      for (const wp of waypoints) {
        wp.floor = 0
        wp.buildingId = syntheticBuildingId
        wp.source = {
          entityId: road.id,
          entityType: 'road',
          field: 'polyline',
          generatorId: 'builtin:polyline-skeleton',
        }
      }
      for (const e of roadEdges) {
        e.source = {
          entityId: road.id,
          entityType: 'road',
          field: 'polyline',
          generatorId: 'builtin:polyline-skeleton',
        }
      }

      nodes.push(...waypoints)
      edges.push(...roadEdges)
    }

    return { nodes, edges, diagnostics }
  }
}
