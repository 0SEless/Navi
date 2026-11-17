import { describe, expect, it } from 'vitest'
import { buildingFront, focusCamera } from '../focus-camera'

describe('focusCamera', () => {
  const box = [{ lat: 11, lng: 120 }, { lat: 11.001, lng: 120.002 }, { lat: 11.0005, lng: 120.001 }]

  it('frames the shape tilted, above the details sheet', () => {
    const cam = focusCamera(box, { width: 400, height: 800 }, 'building')!
    expect(cam.bounds).toEqual([[120, 11], [120.002, 11.001]])
    expect(cam.options.pitch).toBe(50)
    // The lower part of the screen is left for the sheet.
    expect(cam.options.padding.bottom).toBeGreaterThan(cam.options.padding.top)
    // Only as much as the compact card and the tab bar take (owner 2026-11-18), not the old 42%.
    expect(cam.options.padding.bottom).toBeLessThanOrEqual(800 * 0.3)
    expect(cam.options.maxZoom).toBe(20)
  })

  it('goes closer for a room', () => {
    expect(focusCamera(box, { width: 400, height: 800 }, 'room')!.options.maxZoom).toBe(20.8)
  })

  it('needs a shape', () => {
    expect(focusCamera([], { width: 400, height: 800 }, 'room')).toBeNull()
  })
})

describe("facing the building's front (owner 2026-11-18: it was not showing the front of the building)", () => {
  // A 20 m square building around (11, 120); its entrance on the south side.
  const M = 1 / 111320
  const square = [{ lat: 11 - 10 * M, lng: 120 - 10 * M }, { lat: 11 - 10 * M, lng: 120 + 10 * M }, { lat: 11 + 10 * M, lng: 120 + 10 * M }, { lat: 11 + 10 * M, lng: 120 - 10 * M }]

  it('entrance on the south: the camera looks north (bearing 0), so the front faces you', () => {
    const cam = focusCamera(square, { width: 400, height: 800 }, 'building', { lat: 11 - 10 * M, lng: 120 })!
    expect(cam.options.bearing).toBeCloseTo(0, 0)
  })

  it('entrance on the east: the camera looks west (bearing 270)', () => {
    const cam = focusCamera(square, { width: 400, height: 800 }, 'building', { lat: 11, lng: 120 + 10 * M })!
    expect(cam.options.bearing).toBeCloseTo(270, 0)
  })

  it('without a known entrance the bearing is left alone', () => {
    expect(focusCamera(square, { width: 400, height: 800 }, 'building')!.options.bearing).toBeUndefined()
  })
})

describe('buildingFront: which entrance is the front', () => {
  const node = (id: string, type: string, buildingId: string, floor: number, label = id) => ({ id, type, buildingId, floor, label, position: { lat: floor, lng: id.length } })
  it('prefers one called main or front, then the lowest floor; none for a building without entrances', () => {
    const nodes = [node('a', 'entrance', 'b', 2), node('bb', 'building_entrance', 'b', 0), node('ccc', 'entrance', 'b', 1, 'Main Entrance'), node('x', 'room', 'b', 0), node('y', 'entrance', 'other', 0)]
    expect(buildingFront(nodes, 'b')).toEqual({ lat: 1, lng: 3 })
    expect(buildingFront(nodes.filter((n) => n.label !== 'Main Entrance'), 'b')).toEqual({ lat: 0, lng: 2 })
    expect(buildingFront(nodes, 'nope')).toBeNull()
  })
})

