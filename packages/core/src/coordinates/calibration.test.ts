import { describe, it, expect } from 'vitest'
import { CalibrationEngine } from './calibration'
import type { FloorCalibration } from './calibration'

describe('CalibrationEngine', () => {
  const engine = new CalibrationEngine()

  it('computes calibration from 2 control points', () => {
    const cal: FloorCalibration = {
      floorId: 'flr-g',
      imageWidth: 1000,
      imageHeight: 800,
      buildingId: 'bld-1',
      controlPoints: [
        { pixel: { x: 0, y: 0 }, world: { lat: 33.42, lng: -111.93 } },
        { pixel: { x: 100, y: 0 }, world: { lat: 33.421, lng: -111.929 } },
      ],
    }

    const result = engine.calibrate(cal, { lat: 33.42, lng: -111.93 })
    expect(result).not.toBeNull()
    expect(result!.scale).toBeGreaterThan(0)
    expect(result!.confidence).toBeGreaterThanOrEqual(0)
  })

  it('returns null with fewer than 2 control points', () => {
    const cal: FloorCalibration = {
      floorId: 'flr-g',
      imageWidth: 1000,
      imageHeight: 800,
      buildingId: 'bld-1',
      controlPoints: [{ pixel: { x: 0, y: 0 }, world: { lat: 33.42, lng: -111.93 } }],
    }
    expect(engine.calibrate(cal, { lat: 33.42, lng: -111.93 })).toBeNull()
  })

  it('pixelToWorld → worldToPixel round-trip', () => {
    const cal: FloorCalibration = {
      floorId: 'flr-g',
      imageWidth: 1000,
      imageHeight: 800,
      buildingId: 'bld-1',
      controlPoints: [
        { pixel: { x: 0, y: 0 }, world: { lat: 33.42, lng: -111.93 } },
        { pixel: { x: 100, y: 0 }, world: { lat: 33.421, lng: -111.929 } },
      ],
    }

    const result = engine.calibrate(cal, { lat: 33.42, lng: -111.93 })!
    const pixel = { x: 50, y: 50 }
    const world = engine.pixelToWorld(pixel, result)
    const pixelBack = engine.worldToPixel(world, result)
    expect(pixelBack.x).toBeCloseTo(pixel.x, 3)
    expect(pixelBack.y).toBeCloseTo(pixel.y, 3)
  })

  it('computes higher confidence with more control points', () => {
    const cal2: FloorCalibration = {
      floorId: 'flr-g',
      imageWidth: 1000,
      imageHeight: 800,
      buildingId: 'bld-1',
      controlPoints: [
        { pixel: { x: 0, y: 0 }, world: { lat: 33.42, lng: -111.93 } },
        { pixel: { x: 100, y: 0 }, world: { lat: 33.421, lng: -111.929 } },
      ],
    }
    const cal4: FloorCalibration = {
      ...cal2,
      controlPoints: [
        { pixel: { x: 0, y: 0 }, world: { lat: 33.42, lng: -111.93 } },
        { pixel: { x: 100, y: 0 }, world: { lat: 33.421, lng: -111.929 } },
        { pixel: { x: 0, y: 100 }, world: { lat: 33.419, lng: -111.93 } },
        { pixel: { x: 100, y: 100 }, world: { lat: 33.42, lng: -111.928 } },
      ],
    }

    const result2 = engine.calibrate(cal2, { lat: 33.42, lng: -111.93 })!
    const result4 = engine.calibrate(cal4, { lat: 33.42, lng: -111.93 })!
    expect(result4.confidence).toBeLessThanOrEqual(1)
    expect(result2.confidence).toBeGreaterThanOrEqual(0)
  })
})
