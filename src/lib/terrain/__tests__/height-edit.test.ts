import { describe, expect, it } from 'vitest'
import { metresForDrag, padAfterLowering, sideViewCamera, stepFloor } from '../height-edit'

describe('metresForDrag', () => {
  it('dragging up raises; one screen pixel is about one map pixel of metres at the zoom', () => {
    // MapLibre's 512 px tiles: at zoom 18 on the equator a pixel is ~0.299 m.
    expect(metresForDrag(-10, { zoom: 18, lat: 0, pitch: 90, fine: false })).toBeCloseTo(3, 1)
    expect(metresForDrag(10, { zoom: 18, lat: 0, pitch: 90, fine: false })).toBeCloseTo(-3, 1)
  })

  it('a flatter camera needs more pixels per metre; Shift is ten times finer; 0.1 m steps', () => {
    const steep = metresForDrag(-20, { zoom: 18, lat: 11.8, pitch: 75, fine: false })
    const flat = metresForDrag(-20, { zoom: 18, lat: 11.8, pitch: 30, fine: false })
    expect(Math.abs(flat)).toBeGreaterThan(Math.abs(steep))
    expect(metresForDrag(-20, { zoom: 18, lat: 11.8, pitch: 75, fine: true })).toBeCloseTo(Math.round(steep) / 10, 0)
    const value = metresForDrag(-7, { zoom: 17.3, lat: 11.8, pitch: 75, fine: false })
    expect(Math.round(value * 10) / 10).toBe(value)
  })
})

describe('sideViewCamera', () => {
  const rect = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.002 }, { lat: 0.0005, lng: 0.002 }, { lat: 0.0005, lng: 0 }]

  it('a building: looks across its longest edge from the side, steeply tilted, centred', () => {
    const camera = sideViewCamera(rect, 'building')
    expect(camera.pitch).toBe(75)
    expect(camera.center.lng).toBeCloseTo(0.001, 9)
    expect(camera.center.lat).toBeCloseTo(0.00025, 9)
    // The longest edge runs east-west, so the camera faces north (bearing 0) or south (180).
    expect([0, 180]).toContain(Math.round(camera.bearing))
    expect(camera.bounds).toEqual([[0, 0], [0.002, 0.0005]])
  })

  it('a stair: looks across its run, so the steps are seen in profile', () => {
    const camera = sideViewCamera([{ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 }], 'stair')
    // The stair runs north-south; the camera faces east or west.
    expect([90, 270, -90]).toContain(Math.round(camera.bearing))
  })
})

describe('stepFloor', () => {
  const floors = [{ id: 'f1', elevation: 0 }, { id: 'f2', elevation: 3.5 }, { id: 'f3', elevation: 7 }]

  it('steps to the floor nearest the dragged height, never past the top or bottom', () => {
    expect(stepFloor(floors, 'f1', 3)).toBe('f2')
    expect(stepFloor(floors, 'f1', 1)).toBe('f1')
    expect(stepFloor(floors, 'f3', -6)).toBe('f1')
    expect(stepFloor(floors, 'f2', 40)).toBe('f3')
  })
})

describe('padAfterLowering', () => {
  it('always dig only (lower): never builds ground up; keeps a blend distance already set, else 3 m', () => {
    expect(padAfterLowering(undefined)).toEqual({ mode: 'lower', blendMeters: 3 })
    expect(padAfterLowering({ mode: 'off', blendMeters: 8 })).toEqual({ mode: 'lower', blendMeters: 3 })
    // The import's follow-ground default is "both": a raised building must still leave the gap open.
    expect(padAfterLowering({ mode: 'both', blendMeters: 5 })).toEqual({ mode: 'lower', blendMeters: 5 })
    expect(padAfterLowering({ mode: 'raise', blendMeters: 2 })).toEqual({ mode: 'lower', blendMeters: 2 })
  })
})
