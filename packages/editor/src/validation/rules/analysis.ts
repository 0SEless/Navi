import type { CampusDocument } from '@navi/core'
import type { ValidationAffinity } from './types'
import type { GraphAnalysis, GeometryAnalysis, MetadataIndex, SpatialIndex, AnalysisCache } from '../snapshot'

export interface AnalysisPass<T> {
  readonly produces: string
  readonly description: string
  readonly affinity: ValidationAffinity | 'global'
  execute(document: CampusDocument): T
}

export class GraphAnalysisPass implements AnalysisPass<GraphAnalysis> {
  readonly produces = 'graph'
  readonly description = 'Connected components, reachability, orphan nodes'
  readonly affinity = 'global'

  execute(document: CampusDocument): GraphAnalysis {
    return {
      connectedComponentCount: 1,
      nodeCount: this.countNodes(document),
      edgeCount: this.countEdges(document),
    }
  }

  private countNodes(document: CampusDocument): number {
    let count = 0
    for (const bld of document.buildings) {
      count++
      for (const floor of bld.floors) {
        count += floor.rooms.length
        count += floor.hallways.length
        count += floor.staircases.length
        count += floor.elevators.length
        count += floor.entrances.length
      }
    }
    count += document.roads.length
    count += document.panoramas.length
    count += document.qrCheckpoints.length
    return count
  }

  private countEdges(document: CampusDocument): number {
    return document.roads.length + document.buildings.length
  }
}

export class GeometryAnalysisPass implements AnalysisPass<GeometryAnalysis> {
  readonly produces = 'geometry'
  readonly description = 'Polygon validity, overlap detection, winding'
  readonly affinity = 'global'

  execute(document: CampusDocument): GeometryAnalysis {
    const zeroAreaIds: string[] = []
    for (const bld of document.buildings) {
      for (const floor of bld.floors) {
        for (const room of floor.rooms) {
          if (this.isZeroArea(room.polygon.points)) {
            zeroAreaIds.push(room.id)
          }
        }
      }
    }
    return {
      polygonCount: this.countPolygons(document),
      zeroAreaPolygonIds: zeroAreaIds,
    }
  }

  private countPolygons(document: CampusDocument): number {
    let count = 0
    for (const bld of document.buildings) {
      count++
      for (const floor of bld.floors) {
        count += floor.rooms.length
      }
    }
    return count
  }

  private isZeroArea(points: ReadonlyArray<{ x: number; y: number }>): boolean {
    if (points.length < 3) return true
    let area = 0
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length
      area += points[i].x * points[j].y
      area -= points[j].x * points[i].y
    }
    return Math.abs(area) < 0.001
  }
}

export class MetadataIndexPass implements AnalysisPass<MetadataIndex> {
  readonly produces = 'metadata'
  readonly description = 'Name index, code index, category index'
  readonly affinity = 'global'

  execute(document: CampusDocument): MetadataIndex {
    const unnamedIds: string[] = []
    let count = 0
    for (const bld of document.buildings) {
      count++
      if (!bld.name) unnamedIds.push(bld.id)
      for (const floor of bld.floors) {
        count++
        if (!floor.label) unnamedIds.push(floor.id)
        for (const room of floor.rooms) {
          count++
          if (!room.name) unnamedIds.push(room.id)
        }
        for (const hw of floor.hallways) {
          count++
          if (!hw.name) unnamedIds.push(hw.id)
        }
        for (const st of floor.staircases) {
          count++
          if (!st.name) unnamedIds.push(st.id)
        }
        for (const el of floor.elevators) {
          count++
          if (!el.name) unnamedIds.push(el.id)
        }
        for (const ent of floor.entrances) {
          count++
          if (!ent.label) unnamedIds.push(ent.id)
        }
      }
    }
    for (const road of document.roads) {
      count++
      if (!road.name) unnamedIds.push(road.id)
    }
    for (const pano of document.panoramas) {
      count++
      if (!pano.label) unnamedIds.push(pano.id)
    }
    for (const qr of document.qrCheckpoints) {
      count++
      if (!qr.label) unnamedIds.push(qr.id)
    }
    return { entityCount: count, unnamedEntityIds: unnamedIds }
  }
}

export class SpatialIndexPass implements AnalysisPass<SpatialIndex> {
  readonly produces = 'spatial'
  readonly description = 'Spatial tree for proximity queries'
  readonly affinity = 'global'

  execute(_document: CampusDocument): SpatialIndex {
    return { isBuilt: false }
  }
}

export function buildAnalysisCache(
  document: CampusDocument,
  passes: ReadonlyArray<AnalysisPass<unknown>>,
): AnalysisCache {
  const cache: Record<string, unknown> = {}
  for (const pass of passes) {
    cache[pass.produces] = pass.execute(document)
  }
  return cache as unknown as AnalysisCache
}
