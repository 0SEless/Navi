import { describe, expect, it } from 'vitest'
import type { Opening, Wall } from '../../types/entities'
import { buildWindowAssetVolumes } from '../window-assets'

const wall: Wall = { id: 'wall', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, height: 3, thickness: 0.2 }
const opening: Opening = { id: 'window', type: 'window', wallId: 'wall', offset: 2, width: 2, height: 1, sillHeight: 1 }
describe('window assets', () => {
  it.each([undefined, 'open'] as const)('keeps legacy/open aperture empty (%s)', windowAppearance => {
    expect(buildWindowAssetVolumes([wall], [{ ...opening, windowAppearance }])).toEqual({ frames: { type: 'FeatureCollection', features: [] }, glass: { type: 'FeatureCollection', features: [] } })
  })
  it.each([['fixed', 4, 1], ['two-pane', 5, 2]] as const)('builds bounded %s solids', (windowAppearance, frames, glass) => {
    const result = buildWindowAssetVolumes([wall], [{ ...opening, windowAppearance }], 7)
    expect(result.frames.features).toHaveLength(frames)
    expect(result.glass.features).toHaveLength(glass)
    for (const feature of [...result.frames.features, ...result.glass.features]) {
      expect(feature.properties).toMatchObject({ wallId: 'wall', openingId: 'window' })
      expect(feature.properties!.base).toBeGreaterThanOrEqual(8)
      expect(feature.properties!.height).toBeGreaterThan(feature.properties!.base)
      expect(feature.properties!.height).toBeLessThanOrEqual(9)
      for (const [x, y] of feature.geometry.coordinates[0]) { expect(x).toBeGreaterThanOrEqual(2); expect(x).toBeLessThanOrEqual(4); expect(Math.abs(y)).toBeLessThanOrEqual(0.1) }
    }
  })
  it('retains positive finite tiny panes on rotated walls without mutating inputs', () => {
    const walls = [{ ...wall, end: { x: 6, y: 8 } }]
    const openings = [{ ...opening, width: 0.00001, height: 0.00001, windowAppearance: 'two-pane' as const }]
    const before = JSON.stringify([walls, openings])
    const result = buildWindowAssetVolumes(walls, openings)
    expect(result.glass.features).toHaveLength(2)
    for (const f of [...result.frames.features, ...result.glass.features]) {
      expect(f.properties!.height).toBeGreaterThan(f.properties!.base)
      const ring = f.geometry.coordinates[0]
      expect(ring.flat().every(Number.isFinite)).toBe(true)
      expect(Math.hypot(ring[1][0] - ring[0][0], ring[1][1] - ring[0][1])).toBeGreaterThan(0)
    }
    expect(JSON.stringify([walls, openings])).toBe(before)
  })
  it('ignores missing hosts, doors, invalid styles/dimensions and invalid datums', () => {
    for (const patch of [{ wallId: 'missing' }, { type: 'door' }, { windowAppearance: 'other' }, { width: NaN }, { offset: -1 }, { height: 9 }]) {
      expect(buildWindowAssetVolumes([wall], [{ ...opening, windowAppearance: 'fixed', ...patch } as Opening]).glass.features).toHaveLength(0)
    }
    expect(buildWindowAssetVolumes([wall], [{ ...opening, windowAppearance: 'fixed' }], Infinity).frames.features).toHaveLength(0)
  })
})
