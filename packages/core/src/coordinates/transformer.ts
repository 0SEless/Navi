import type { LatLng, LocalCoord } from '../types'
import { wgs84ToWebMercator, webMercatorToWgs84, EARTH_RADIUS } from './crs'

// ── Building local system ──
export interface BuildingLocalSystem {
  buildingId: string
  origin: LatLng           // building reference point (footprint centroid)
  rotation: number         // degrees from north (clockwise)
}

// ── Camera state for screen transforms ──
export interface CameraState {
  center: LatLng
  zoom: number
  bearing: number          // degrees from north
  pitch: number            // degrees from horizontal
  viewportWidth: number    // pixels
  viewportHeight: number   // pixels
}

// ── CoordinateTransformer ──
export class CoordinateTransformer {
  private buildingSystems = new Map<string, BuildingLocalSystem>()

  registerBuilding(system: BuildingLocalSystem): void {
    this.buildingSystems.set(system.buildingId, system)
  }

  getBuildingSystem(buildingId: string): BuildingLocalSystem | undefined {
    return this.buildingSystems.get(buildingId)
  }

  // ── World ↔ Campus ──

  worldToCampus(latlng: LatLng): { x: number; y: number } {
    return wgs84ToWebMercator(latlng)
  }

  campusToWorld(x: number, y: number): LatLng {
    return webMercatorToWgs84(x, y)
  }

  // ── Campus ↔ Building-local ──

  campusToBuildingLocal(campus: { x: number; y: number }, buildingId: string): LocalCoord | null {
    const sys = this.buildingSystems.get(buildingId)
    if (!sys) return null
    const campusOrigin = wgs84ToWebMercator(sys.origin)
    const dx = campus.x - campusOrigin.x
    const dy = campus.y - campusOrigin.y
    const rad = (-sys.rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos,
    }
  }

  buildingLocalToCampus(local: LocalCoord, buildingId: string): { x: number; y: number } | null {
    const sys = this.buildingSystems.get(buildingId)
    if (!sys) return null
    const rad = (sys.rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const x = local.x * cos - local.y * sin
    const y = local.x * sin + local.y * cos
    const campusOrigin = wgs84ToWebMercator(sys.origin)
    return { x: campusOrigin.x + x, y: campusOrigin.y + y }
  }

  buildingLocalToWorld(local: LocalCoord, buildingId: string): LatLng | null {
    const campus = this.buildingLocalToCampus(local, buildingId)
    if (!campus) return null
    return this.campusToWorld(campus.x, campus.y)
  }

  worldToBuildingLocal(latlng: LatLng, buildingId: string): LocalCoord | null {
    const campus = this.worldToCampus(latlng)
    return this.campusToBuildingLocal(campus, buildingId)
  }

  // ── Building-local ↔ Floor plan pixel ──

  localToPixel(local: LocalCoord, calibration: FloorPlanCalibration): { x: number; y: number } {
    const dx = local.x - calibration.originLocal.x
    const dy = local.y - calibration.originLocal.y
    return {
      x: dx * calibration.scale + calibration.originPixel.x,
      y: -dy * calibration.scale + calibration.originPixel.y,  // y inverted (pixel space)
    }
  }

  pixelToLocal(pixel: { x: number; y: number }, calibration: FloorPlanCalibration): LocalCoord {
    const dx = pixel.x - calibration.originPixel.x
    const dy = pixel.y - calibration.originPixel.y
    return {
      x: dx / calibration.scale + calibration.originLocal.x,
      y: -dy / calibration.scale + calibration.originLocal.y,
    }
  }

  // ── Screen ↔ World ──
  // Simplified — assumes pitch=0, bearing=0 for V1

  screenToWorld(screenX: number, screenY: number, camera: CameraState): LatLng {
    const tileSize = 256
    const scale = Math.pow(2, camera.zoom)
    const worldSize = tileSize * scale

    const cx = screenX - camera.viewportWidth / 2
    const cy = screenY - camera.viewportHeight / 2
    const centerMerc = wgs84ToWebMercator(camera.center)

    const metersPerPixel = (2 * Math.PI * EARTH_RADIUS) / worldSize
    const x = centerMerc.x + cx * metersPerPixel
    const y = centerMerc.y - cy * metersPerPixel

    return webMercatorToWgs84(x, y)
  }

  worldToScreen(latlng: LatLng, camera: CameraState): { x: number; y: number } {
    const tileSize = 256
    const scale = Math.pow(2, camera.zoom)
    const worldSize = tileSize * scale

    const centerMerc = wgs84ToWebMercator(camera.center)
    const pointMerc = wgs84ToWebMercator(latlng)

    const metersPerPixel = (2 * Math.PI * EARTH_RADIUS) / worldSize
    const cx = (pointMerc.x - centerMerc.x) / metersPerPixel
    const cy = (centerMerc.y - pointMerc.y) / metersPerPixel

    return {
      x: cx + camera.viewportWidth / 2,
      y: cy + camera.viewportHeight / 2,
    }
  }
}

// ── Floor plan calibration type (used by localToPixel/pixelToLocal) ──

export interface FloorPlanCalibration {
  originLocal: LocalCoord
  originPixel: { x: number; y: number }
  scale: number  // pixels per meter
}
