import { describe, expect, it } from 'vitest'
import { focusCamera } from '../focus-camera'

describe('focusCamera', () => {
  const box = [{ lat: 11, lng: 120 }, { lat: 11.001, lng: 120.002 }, { lat: 11.0005, lng: 120.001 }]

  it('frames the shape tilted, above the details sheet', () => {
    const cam = focusCamera(box, { width: 400, height: 800 }, 'building')!
    expect(cam.bounds).toEqual([[120, 11], [120.002, 11.001]])
    expect(cam.options.pitch).toBe(50)
    // The lower part of the screen is left for the sheet.
    expect(cam.options.padding.bottom).toBeGreaterThan(cam.options.padding.top)
    expect(cam.options.maxZoom).toBe(20)
  })

  it('goes closer for a room', () => {
    expect(focusCamera(box, { width: 400, height: 800 }, 'room')!.options.maxZoom).toBe(20.8)
  })

  it('needs a shape', () => {
    expect(focusCamera([], { width: 400, height: 800 }, 'room')).toBeNull()
  })
})
