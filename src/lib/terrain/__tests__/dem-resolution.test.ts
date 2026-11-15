import { describe, expect, it } from 'vitest'
import { DEM_MAXZOOM, demMetresPerPixel } from '../dem-encode'

// Owner 2026-11-15: a graded 6 m road looked rounded across, like a tube. The ground is stored in 1 m cells, but
// the 3D map drew it from height tiles of about 2.3 m per pixel (zoom 16), which rounds a flat road top and its
// edges. The tiles must be at least as fine as the ground itself.
describe('3D ground detail', () => {
  it('height tiles are at least as fine as the 1 m ground at the campus latitude', () => {
    expect(demMetresPerPixel(11.8, 16)).toBeGreaterThan(2)
    expect(demMetresPerPixel(11.8, DEM_MAXZOOM)).toBeLessThanOrEqual(1)
  })
})
