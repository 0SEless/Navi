import type { LatLng } from '@navi/core'
import type { LoadedPackage } from '../loader'
import type { PanoramaEntry, HotspotEntry } from '@navi/core'

// ── Panorama Service (M6.5b) ──
// Viewer-agnostic capability. Exposes panorama metadata and hotspot relationships
// only. No rendering, camera, transition, DOM, or viewer-library concerns.

export interface PanoramaPosition {
  readonly yaw: number // degrees, 0-360
  readonly pitch: number // degrees, -90 to 90
}

export interface PanoramaResult {
  readonly id: string
  readonly roomId?: string
  readonly buildingId?: string
  readonly floor?: number
  readonly imageAssetId: string
  readonly heading?: number
  readonly position: LatLng
}

export interface HotspotResult {
  readonly id: string
  readonly type: 'navigation' | 'information' | 'link'
  readonly position: PanoramaPosition
  readonly targetPanoramaId?: string
  readonly targetRoomId?: string
  readonly targetUrl?: string
  readonly label?: string
}

// Approximate straight-line distance in meters between two lat/lng points.
// Consistent with BuildingService's nearest calculation.
function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = (a.lat - b.lat) * 111320
  const avgLat = ((a.lat + b.lat) / 2) * Math.PI / 180
  const dLng = (a.lng - b.lng) * 111320 * Math.cos(avgLat)
  return Math.hypot(dLat, dLng)
}

export class PanoramaService {
  private readonly panoramas: readonly PanoramaEntry[]
  private readonly panoramaIds: ReadonlySet<string>

  constructor(pkg: LoadedPackage) {
    this.panoramas = pkg.panoramaIndex?.panoramas ?? []
    this.panoramaIds = new Set(this.panoramas.map(p => p.id))
  }

  get(id: string): PanoramaResult | undefined {
    const entry = this.panoramas.find(p => p.id === id)
    return entry ? this.mapPanorama(entry) : undefined
  }

  list(buildingId?: string): PanoramaResult[] {
    return this.panoramas
      .filter(p => (buildingId ? p.buildingId === buildingId : true))
      .map(p => this.mapPanorama(p))
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  findNearest(position: LatLng): PanoramaResult | undefined {
    if (this.panoramas.length === 0) return undefined
    let nearest = this.panoramas[0]
    let minDist = distanceMeters(position, nearest.position)
    for (let i = 1; i < this.panoramas.length; i++) {
      const dist = distanceMeters(position, this.panoramas[i].position)
      if (dist < minDist) {
        minDist = dist
        nearest = this.panoramas[i]
      }
    }
    return this.mapPanorama(nearest)
  }

  getHotspots(panoramaId: string): HotspotResult[] {
    const entry = this.panoramas.find(p => p.id === panoramaId)
    if (!entry) return []
    return entry.hotspots.map(h => this.mapHotspot(h))
  }

  resolve(roomId: string): PanoramaResult | undefined {
    const entry = this.panoramas.find(p =>
      p.hotspots.some(h => h.type === 'navigation' && h.target === roomId),
    )
    if (!entry) return undefined
    return this.mapPanorama(entry, roomId)
  }

  private mapPanorama(entry: PanoramaEntry, roomId?: string): PanoramaResult {
    return {
      id: entry.id,
      roomId,
      buildingId: entry.buildingId,
      floor: entry.floor,
      imageAssetId: entry.imageAssetId,
      heading: entry.heading,
      position: entry.position,
    }
  }

  private mapHotspot(h: HotspotEntry): HotspotResult {
    const base: HotspotResult = {
      id: h.id,
      type: h.type,
      position: { yaw: h.yaw, pitch: h.pitch },
      label: h.label,
    }
    if (h.type === 'navigation') {
      if (this.panoramaIds.has(h.target)) {
        return { ...base, targetPanoramaId: h.target }
      }
      return { ...base, targetRoomId: h.target }
    }
    if (h.type === 'link') {
      return { ...base, targetUrl: h.target }
    }
    return base
  }
}
