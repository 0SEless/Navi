import { describe, expect, it } from 'vitest'
import { campusCameraLimits } from '../camera-limits'

// The ASU-Ibajay probe boundary: about 435 m east-west by 300 m north-south.
const boundary = [
  { lat: 11.8163, lng: 122.169 }, { lat: 11.8163, lng: 122.173 }, { lat: 11.819, lng: 122.173 }, { lat: 11.819, lng: 122.169 },
]

describe('campusCameraLimits', () => {
  it('keeps the view on the campus: its box plus half its size on every side', () => {
    const limits = campusCameraLimits(boundary, { width: 1240, height: 812 })!
    const [[w, s], [e, n]] = limits.maxBounds
    expect(w).toBeCloseTo(122.169 - 0.002, 9)
    expect(e).toBeCloseTo(122.173 + 0.002, 9)
    expect(s).toBeCloseTo(11.8163 - 0.00135, 9)
    expect(n).toBeCloseTo(11.819 + 0.00135, 9)
  })

  it('zoom out stops one level beyond the whole campus; zoom in at 21; tilt at 80°', () => {
    const limits = campusCameraLimits(boundary, { width: 1240, height: 812 })!
    // 812 px for 0.0027° of latitude (Mercator stretch 1.0216 at 11.8°) fits at zoom ≈ 17.66 (the
    // 1240 px width would allow 17.73): the whole campus fits at 17.66, so zoom out stops at 16.66.
    expect(limits.minZoom).toBeCloseTo(16.66, 1)
    expect(limits.maxZoom).toBe(21)
    expect(limits.maxPitch).toBe(80)
  })

  it('a narrow window lets you zoom out further (it is limited by the east-west extent)', () => {
    const wide = campusCameraLimits(boundary, { width: 1240, height: 812 })!
    const narrow = campusCameraLimits(boundary, { width: 300, height: 812 })!
    expect(narrow.minZoom).toBeLessThan(wide.minZoom)
  })

  it('no boundary yet → no limits', () => {
    expect(campusCameraLimits([], { width: 1240, height: 812 })).toBeNull()
    expect(campusCameraLimits(boundary.slice(0, 2), { width: 1240, height: 812 })).toBeNull()
  })
})
