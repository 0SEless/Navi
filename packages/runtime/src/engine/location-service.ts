import type { LoadedPackage } from '../loader'
import type { NavNode, BuildingEntry, LatLng } from '@navi/core'
import type { BuildingResult } from './building-service'

export interface SnapResult {
  readonly node: NavNode
  readonly distance: number
}

export interface LocationContext {
  readonly position: LatLng
  readonly node?: SnapResult
  readonly building?: BuildingResult
  readonly isIndoor: boolean
}

function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = (a.lat - b.lat) * 111320
  const avgLat = (a.lat + b.lat) / 2 * Math.PI / 180
  const dLng = (a.lng - b.lng) * 111320 * Math.cos(avgLat)
  return Math.hypot(dLat, dLng)
}

const BUILDING_CONTAINMENT_METERS = 100

export class LocationService {
  private nodes: NavNode[]
  private buildings: BuildingEntry[]

  constructor(pkg: LoadedPackage) {
    this.nodes = pkg.graph.nodes
    this.buildings = pkg.buildingIndex?.buildings ?? []
  }

  resolve(position: LatLng): LocationContext {
    return this.resolveContext(position)
  }

  snapToNode(position: LatLng): SnapResult | undefined {
    return this.resolveContext(position).node
  }

  getBuilding(position: LatLng): BuildingResult | undefined {
    return this.resolveContext(position).building
  }

  getFloor(position: LatLng): number | undefined {
    return this.resolveContext(position).node?.node.floor
  }

  isInsideBuilding(position: LatLng): boolean {
    return this.resolveContext(position).isIndoor
  }

  private resolveContext(position: LatLng): LocationContext {
    const snapResult = this.findNearestNode(position)
    const building = this.findContainingBuilding(position)
    return {
      position,
      node: snapResult ?? undefined,
      building: building ?? undefined,
      isIndoor: building !== null,
    }
  }

  private findNearestNode(position: LatLng): SnapResult | null {
    if (this.nodes.length === 0) return null
    let nearest = this.nodes[0]
    let minDist = distanceMeters(position, nearest.position)
    for (let i = 1; i < this.nodes.length; i++) {
      const dist = distanceMeters(position, this.nodes[i].position)
      if (dist < minDist) {
        minDist = dist
        nearest = this.nodes[i]
      }
    }
    return { node: nearest, distance: minDist }
  }

  private findContainingBuilding(position: LatLng): BuildingResult | null {
    if (this.buildings.length === 0) return null
    let nearest = this.buildings[0]
    let minDist = distanceMeters(position, nearest.position)
    for (let i = 1; i < this.buildings.length; i++) {
      const dist = distanceMeters(position, this.buildings[i].position)
      if (dist < minDist) {
        minDist = dist
        nearest = this.buildings[i]
      }
    }
    if (minDist > BUILDING_CONTAINMENT_METERS) return null
    return {
      id: nearest.id,
      name: nearest.name,
      code: nearest.code,
      category: nearest.category,
      position: nearest.position,
      entrances: nearest.entrances.map(e => e.id),
      floors: nearest.floors.map(f => f.label),
    }
  }
}
