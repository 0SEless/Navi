import type { LatLng, LocalCoord } from '../types'
import { wgs84ToWebMercator, webMercatorToWgs84, haversine } from './crs'

// ── Floor plan calibration ──

export interface ControlPoint {
  pixel: { x: number; y: number }
  world: LatLng  // lat/lng on map
}

export interface FloorCalibration {
  floorId: string
  imageWidth: number
  imageHeight: number
  controlPoints: ControlPoint[]
  buildingId: string
}

export interface CalibrationResult {
  floorId: string
  scale: number           // meters per pixel
  rotation: number        // degrees
  originPixel: { x: number; y: number }
  originLocal: LocalCoord
  confidence: number      // 0-1, based on control point residuals
}

// ── Calibration engine ──

export class CalibrationEngine {
  calibrate(cal: FloorCalibration, buildingLocalOrigin: LatLng): CalibrationResult | null {
    if (cal.controlPoints.length < 2) return null

    const cps = cal.controlPoints

    // Compute scale from first two control points
    const pixelDist = Math.sqrt(
      (cps[1].pixel.x - cps[0].pixel.x) ** 2 +
      (cps[1].pixel.y - cps[0].pixel.y) ** 2,
    )
    const worldDist = haversine(cps[0].world, cps[1].world)
    const scale = pixelDist > 0 ? worldDist / pixelDist : 1

    // Compute rotation from first two points
    const pixelAngle = Math.atan2(
      cps[1].pixel.y - cps[0].pixel.y,
      cps[1].pixel.x - cps[0].pixel.x,
    )
    const worldAngle = Math.atan2(
      cps[1].world.lat - cps[0].world.lat,
      cps[1].world.lng - cps[0].world.lng,
    )
    const rotation = ((worldAngle - pixelAngle) * 180) / Math.PI

    // Offset: first control point local → pixel mapping
    const originLocal: LocalCoord = { x: 0, y: 0 }
    const originPixel = cps[0].pixel

    // Compute confidence from residuals of remaining control points
    let totalError = 0
    let residualCount = 0
    for (let i = 2; i < cps.length; i++) {
      const cp = cps[i]
      // Predict pixel from world
      const dx = (cp.world.lng - cps[0].world.lng) / scale
      const dy = (cp.world.lat - cps[0].world.lat) / scale
      const predX = cps[0].pixel.x + dx
      const predY = cps[0].pixel.y + dy
      const error = Math.sqrt(
        (predX - cp.pixel.x) ** 2 + (predY - cp.pixel.y) ** 2,
      )
      totalError += error
      residualCount++
    }

    const residual = residualCount > 0 ? totalError / residualCount : 0
    const maxExpectedError = Math.max(cal.imageWidth, cal.imageHeight) * 0.05  // 5%
    const confidence = Math.max(0, Math.min(1, 1 - residual / maxExpectedError))

    return {
      floorId: cal.floorId,
      scale,
      rotation,
      originPixel,
      originLocal,
      confidence,
    }
  }

  // ── Transform points using calibration ──

  pixelToWorld(pixel: { x: number; y: number }, calResult: CalibrationResult): LatLng {
    const dx = (pixel.x - calResult.originPixel.x) * calResult.scale
    const dy = (pixel.y - calResult.originPixel.y) * calResult.scale
    const rad = (calResult.rotation * Math.PI) / 180
    const worldLat = calResult.originLocal.y + dx * Math.sin(rad) + dy * Math.cos(rad)
    const worldLng = calResult.originLocal.x + dx * Math.cos(rad) - dy * Math.sin(rad)
    return { lat: worldLat, lng: worldLng }
  }

  worldToPixel(world: LatLng, calResult: CalibrationResult): { x: number; y: number } {
    const dx = world.lng - calResult.originLocal.x
    const dy = world.lat - calResult.originLocal.y
    const rad = (-calResult.rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const pixelX = (dx * cos - dy * sin) / calResult.scale + calResult.originPixel.x
    const pixelY = (dx * sin + dy * cos) / calResult.scale + calResult.originPixel.y
    return { x: pixelX, y: pixelY }
  }
}
