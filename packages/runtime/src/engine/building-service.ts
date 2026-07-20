import type { LatLng, BuildingEntry } from '@navi/core'
import type { LoadedPackage } from '../loader'

const CONTAINMENT_RADIUS_METERS = 100

// Approximate distance in meters between two lat/lng points.
// Accurate enough for nearest-building and containment checks at campus scale.
function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = (a.lat - b.lat) * 111320
  const avgLat = (a.lat + b.lat) / 2 * Math.PI / 180
  const dLng = (a.lng - b.lng) * 111320 * Math.cos(avgLat)
  return Math.hypot(dLat, dLng)
}

export interface BuildingResult {
  readonly id: string
  readonly name: string
  readonly code: string
  readonly category: string
  readonly position: LatLng
  readonly entrances: readonly string[]
  readonly floors: readonly string[]
}

export interface EntranceResult {
  readonly id: string
  readonly name: string
  readonly position: LatLng
}

export class BuildingService {
  private buildings: BuildingEntry[]

  constructor(pkg: LoadedPackage) {
    this.buildings = pkg.buildingIndex?.buildings ?? []
  }

  get(id: string): BuildingResult | undefined {
    const entry = this.buildings.find(b => b.id === id)
    return entry ? this.mapResult(entry) : undefined
  }

  list(): BuildingResult[] {
    return this.buildings
      .map(b => this.mapResult(b))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  findNearest(position: LatLng): BuildingResult | undefined {
    if (this.buildings.length === 0) return undefined
    let nearest = this.buildings[0]
    let minDist = distanceMeters(position, nearest.position)
    for (let i = 1; i < this.buildings.length; i++) {
      const dist = distanceMeters(position, this.buildings[i].position)
      if (dist < minDist) {
        minDist = dist
        nearest = this.buildings[i]
      }
    }
    return this.mapResult(nearest)
  }

  getEntrances(buildingId: string): EntranceResult[] {
    const building = this.buildings.find(b => b.id === buildingId)
    if (!building) return []
    return building.entrances
      .map(e => ({
        id: e.id,
        name: e.label,
        position: e.position,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  findContaining(position: LatLng): BuildingResult | undefined {
    const nearest = this.findNearest(position)
    if (!nearest) return undefined
    const entry = this.buildings.find(b => b.id === nearest.id)
    if (!entry) return undefined
    const dist = distanceMeters(position, entry.position)
    return dist <= CONTAINMENT_RADIUS_METERS ? nearest : undefined
  }

  private mapResult(entry: BuildingEntry): BuildingResult {
    return {
      id: entry.id,
      name: entry.name,
      code: entry.code,
      category: entry.category,
      position: entry.position,
      entrances: entry.entrances.map(e => e.id),
      floors: entry.floors.map(f => f.label),
    }
  }
}
