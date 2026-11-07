import { describe, expect, it } from 'vitest'
import { createTerrainSampler } from '../compose'
import { toLocal } from '../grid'
import { ibajayCampus, ibajayDoc, ibajayGrid } from './ibajay-fixture'

describe('fits only reach points near their building or road (fit index)', () => {
  it('far from every building the ground is untouched (heightAt = groundAt)', () => {
    const s = createTerrainSampler(ibajayDoc())!
    // The south-east of the campus box is open ground, > 30 m from any footprint.
    const p = toLocal(ibajayGrid, { lat: 11.8175, lng: 122.1700 })
    expect(s.heightAt(p.x, p.y)).toBeCloseTo(s.groundAt(p.x, p.y), 9)
  })

  it('inside a lowered pad above its base the ground is dug to the base', () => {
    const s = createTerrainSampler(ibajayDoc())!
    const ring = ibajayCampus.footprints[3].map(([lat, lng]) => toLocal(ibajayGrid, { lat, lng }))
    const c = { x: ring.reduce((a, p) => a + p.x, 0) / ring.length, y: ring.reduce((a, p) => a + p.y, 0) / ring.length }
    // Follow-ground base = mean ground over the footprint; where the ground is higher it is lowered to the base.
    const fit = s.fitAt(c.x, c.y)
    expect(fit).toBeLessThanOrEqual(0)
    expect(s.heightAt(c.x, c.y)).toBeCloseTo(s.groundAt(c.x, c.y) + fit, 9)
  })

  it('without pads every point is the plain ground', () => {
    const s = createTerrainSampler(ibajayDoc({ pads: false }))!
    for (let i = 0; i < 200; i++) expect(s.fitAt(i * 3, (i * 7) % 300)).toBe(0)
  })
})
