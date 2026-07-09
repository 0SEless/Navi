import type { LatLng, LocalCoord, WorldPolygon, LocalPolygon, WorldPolyline, LocalPolyline } from '../types'
import { GridSpatialIndex, type SpatialEntity } from './spatial-index'
import { polygonBBox, pointInPolygon, type BBox } from './polygon'
import { pointDistance, polylineLength } from './polyline'
import { euclideanToLatLng, latLngToEuclidean } from './project'
import type { CoordinateTransformer } from '../coordinates/transformer'

// ── Typed entity references ──

export type EntityGeometryType =
  | 'building' | 'room' | 'hallway' | 'staircase' | 'elevator'
  | 'entrance' | 'road'

export interface EntityRef {
  id: string
  type: EntityGeometryType
  buildingId?: string
  floorId?: string
}

export interface SnapTarget {
  position: LatLng
  type: 'vertex' | 'midpoint' | 'edge' | 'endpoint' | 'entrance' | 'nav_node' | 'grid'
  entityId?: string
  distance: number  // in meters (world space)
}

// ── Spatial Query API ──

export class SpatialQuery {
  private index = new GridSpatialIndex(50)
  private entityMap = new Map<string, { ref: EntityRef; bbox: BBox }>()
  private vertexCache = new Map<string, LatLng[]>()
  private edgeCache = new Map<string, [LatLng, LatLng][]>()

  constructor(private transformer?: CoordinateTransformer) {}

  clear(): void {
    this.index.clear()
    this.entityMap.clear()
    this.vertexCache.clear()
    this.edgeCache.clear()
  }

  // ── Indexing ──

  insertBuilding(id: string, footprint: WorldPolygon): void {
    const bbox = polygonBBox(footprint)
    const entity: SpatialEntity = { id, bbox }
    this.index.insert(entity)
    this.entityMap.set(id, { ref: { id, type: 'building' }, bbox })
    this.cacheVertices(id, footprint.points)
  }

  insertRoom(id: string, polygon: LocalPolygon, buildingId: string, transformer: CoordinateTransformer): void {
    const worldPoints = this.localToWorldPoints(polygon.points, buildingId, transformer)
    if (!worldPoints) return
    const worldPoly: WorldPolygon = { points: worldPoints }
    const bbox = polygonBBox(worldPoly)
    const entity: SpatialEntity = { id, bbox }
    this.index.insert(entity)
    this.entityMap.set(id, { ref: { id, type: 'room', buildingId }, bbox })
    this.cacheVertices(id, worldPoints)
  }

  insertHallway(id: string, polyline: LocalPolyline, buildingId: string, transformer: CoordinateTransformer): void {
    const worldPoints = this.localToWorldPoints(polyline.points, buildingId, transformer)
    if (!worldPoints) return
    const worldPoly: WorldPolyline = { points: worldPoints }
    const bbox = polygonBBox({ points: worldPoints } as any)
    const entity: SpatialEntity = { id, bbox }
    this.index.insert(entity)
    this.entityMap.set(id, { ref: { id, type: 'hallway', buildingId }, bbox })
    this.cacheEdges(id, worldPoints)
  }

  insertEntrance(id: string, position: LatLng, buildingId: string): void {
    const bbox: BBox = { minX: position.lng, maxX: position.lng, minY: position.lat, maxY: position.lat }
    const entity: SpatialEntity = { id, bbox }
    this.index.insert(entity)
    this.entityMap.set(id, { ref: { id, type: 'entrance', buildingId }, bbox })
  }

  insertRoad(id: string, polyline: WorldPolyline): void {
    const bbox = polygonBBox({ points: polyline.points } as any)
    const entity: SpatialEntity = { id, bbox }
    this.index.insert(entity)
    this.entityMap.set(id, { ref: { id, type: 'road' }, bbox })
    this.cacheVertices(id, polyline.points)
    this.cacheEdges(id, polyline.points)
  }

  remove(id: string): void {
    this.index.remove(id)
    this.entityMap.delete(id)
    this.vertexCache.delete(id)
    this.edgeCache.delete(id)
  }

  // ── Queries ──

  entityAtPoint(point: LatLng, buildingId?: string): EntityRef[] {
    const { x, y } = latLngToEuclidean(point)
    const candidates = this.index.queryPoint(x, y)
    const results: EntityRef[] = []
    for (const c of candidates) {
      const info = this.entityMap.get(c.id)
      if (!info) continue
      if (buildingId && info.ref.buildingId && info.ref.buildingId !== buildingId) continue
      results.push(info.ref)
    }
    return results
  }

  entitiesInBounds(bounds: BBox): EntityRef[] {
    const candidates = this.index.queryBBox(bounds)
    return candidates.map(c => this.entityMap.get(c.id)?.ref).filter(Boolean) as EntityRef[]
  }

  nearestEntity(point: LatLng, maxDistance: number = Infinity): EntityRef | null {
    const { x, y } = latLngToEuclidean(point)
    const nearest = this.index.queryNearest(x, y, 10)
    if (nearest.length === 0) return null
    const info = this.entityMap.get(nearest[0].id)
    if (!info) return null
    const d = this.distance(point, nearest[0])
    if (d > maxDistance) return null
    return info.ref
  }

  entitiesIntersecting(polygon: WorldPolygon | LocalPolygon): EntityRef[] {
    const bbox = polygonBBox(polygon)
    const candidates = this.index.queryBBox(bbox)
    const results: EntityRef[] = []
    for (const c of candidates) {
      const info = this.entityMap.get(c.id)
      if (!info) continue
      if (bboxesOverlap(info.bbox, bbox)) {
        results.push(info.ref)
      }
    }
    return results
  }

  // ── Snap queries ──

  nearestVertex(point: LatLng, maxDistance: number = 10): SnapTarget | null {
    const { x, y } = latLngToEuclidean(point)
    let best: SnapTarget | null = null
    for (const [entityId, vertices] of this.vertexCache) {
      for (const v of vertices) {
        const d = this.distance(point, v)
        if (d < maxDistance && (!best || d < best.distance)) {
          best = { position: v, type: 'vertex', entityId, distance: d }
        }
      }
    }
    return best
  }

  nearestEdge(point: LatLng, maxDistance: number = 10): SnapTarget | null {
    let best: SnapTarget | null = null
    for (const [entityId, edges] of this.edgeCache) {
      for (const [a, b] of edges) {
        const nearest = this.nearestPointOnSegment(point, a, b)
        if (!nearest) continue
        const d = this.distance(point, nearest)
        if (d < maxDistance && (!best || d < best.distance)) {
          best = { position: nearest, type: 'edge', entityId, distance: d }
        }
      }
    }
    return best
  }

  // ── Helpers ──

  private localToWorldPoints(points: LocalCoord[], buildingId: string, transformer: CoordinateTransformer): LatLng[] | null {
    return points.map(p => transformer.buildingLocalToWorld(p, buildingId)).filter(Boolean) as LatLng[]
  }

  private cacheVertices(id: string, points: LatLng[]): void {
    this.vertexCache.set(id, points)
  }

  private cacheEdges(id: string, points: LatLng[]): void {
    const edges: [LatLng, LatLng][] = []
    for (let i = 0; i < points.length - 1; i++) {
      edges.push([points[i], points[i + 1]])
    }
    this.edgeCache.set(id, edges)
  }

  private distance(a: LatLng, b: LatLng | SpatialEntity): number {
    if ('lat' in b) {
      const dlat = (b as LatLng).lat - a.lat
      const dlng = (b as LatLng).lng - a.lng
      return Math.sqrt(dlat * dlat + dlng * dlng) * 111320
    }
    const e = b as SpatialEntity
    const cx = (e.bbox.minX + e.bbox.maxX) / 2
    const cy = (e.bbox.minY + e.bbox.maxY) / 2
    const { x, y } = latLngToEuclidean(a)
    return Math.sqrt((cx - x) ** 2 + (cy - y) ** 2)
  }

  private nearestPointOnSegment(p: LatLng, a: LatLng, b: LatLng): LatLng | null {
    const ap = latLngToEuclidean(p)
    const aa = latLngToEuclidean(a)
    const ab = latLngToEuclidean(b)
    const dx = ab.x - aa.x
    const dy = ab.y - aa.y
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return a
    let t = ((ap.x - aa.x) * dx + (ap.y - aa.y) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    return euclideanToLatLng({ x: aa.x + t * dx, y: aa.y + t * dy })
  }
}

function bboxesOverlap(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}
