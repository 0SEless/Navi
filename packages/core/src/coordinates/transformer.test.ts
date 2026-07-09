import { describe, it, expect, beforeEach } from 'vitest'
import { CoordinateTransformer } from './transformer'
import { wgs84ToWebMercator } from './crs'

describe('CoordinateTransformer', () => {
  let tf: CoordinateTransformer

  beforeEach(() => {
    tf = new CoordinateTransformer()
    tf.registerBuilding({
      buildingId: 'bld-1',
      origin: { lat: 33.42, lng: -111.93 },
      rotation: 0,
    })
  })

  it('worldToCampus → campusToWorld round-trip', () => {
    const original = { lat: 33.425, lng: -111.925 }
    const campus = tf.worldToCampus(original)
    const back = tf.campusToWorld(campus.x, campus.y)
    expect(back.lat).toBeCloseTo(original.lat, 8)
    expect(back.lng).toBeCloseTo(original.lng, 8)
  })

  it('world → building-local → world round-trip', () => {
    const world = { lat: 33.421, lng: -111.929 }
    const local = tf.worldToBuildingLocal(world, 'bld-1')
    expect(local).not.toBeNull()
    const back = tf.buildingLocalToWorld(local!, 'bld-1')
    expect(back!.lat).toBeCloseTo(world.lat, 8)
    expect(back!.lng).toBeCloseTo(world.lng, 8)
  })

  it('building-local origin is at building origin', () => {
    const local = tf.worldToBuildingLocal({ lat: 33.42, lng: -111.93 }, 'bld-1')
    expect(local!.x).toBeCloseTo(0, 3)
    expect(local!.y).toBeCloseTo(0, 3)
  })

  it('returns null for unknown building', () => {
    expect(tf.worldToBuildingLocal({ lat: 0, lng: 0 }, 'unknown')).toBeNull()
    expect(tf.buildingLocalToWorld({ x: 0, y: 0 }, 'unknown')).toBeNull()
  })

  it('localToPixel → pixelToLocal round-trip', () => {
    const local = { x: 10, y: 5 }
    const calibration = { originLocal: { x: 0, y: 0 }, originPixel: { x: 100, y: 100 }, scale: 50 }
    const pixel = tf.localToPixel(local, calibration)
    const back = tf.pixelToLocal(pixel, calibration)
    expect(back.x).toBeCloseTo(local.x, 5)
    expect(back.y).toBeCloseTo(local.y, 5)
  })

  it('screenToWorld → worldToScreen round-trip', () => {
    const camera = {
      center: { lat: 33.42, lng: -111.93 },
      zoom: 18,
      bearing: 0,
      pitch: 0,
      viewportWidth: 800,
      viewportHeight: 600,
    }
    const world = { lat: 33.421, lng: -111.929 }
    const screen = tf.worldToScreen(world, camera)
    const back = tf.screenToWorld(screen.x, screen.y, camera)
    expect(back.lat).toBeCloseTo(world.lat, 5)
    expect(back.lng).toBeCloseTo(world.lng, 5)
  })
})
