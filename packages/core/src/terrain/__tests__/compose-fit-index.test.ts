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

  it('without pads the ground changes only inside building outlines and their 2.5 m working space', () => {
    const s = createTerrainSampler(ibajayDoc({ pads: false }))!
    const rings = ibajayCampus.footprints.map((f) => f.map(([lat, lng]) => toLocal(ibajayGrid, { lat, lng })))
    const inside = (x: number, y: number) => rings.some((ring) => {
      let hit = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j]
        if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit
      }
      return hit
    })
    for (let i = 0; i < 200; i++) {
      const x = i * 3, y = (i * 7) % 300
      const near = rings.some((ring) => ring.some((a, i) => {
        const b = ring[(i + 1) % ring.length]
        const dx = b.x - a.x, dy = b.y - a.y
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)))
        return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)) <= 2.5
      }))
      if (!inside(x, y) && !near) expect(s.fitAt(x, y)).toBe(0)
    }
    const ring = rings[3]
    const c = { x: ring.reduce((a, p) => a + p.x, 0) / ring.length, y: ring.reduce((a, p) => a + p.y, 0) / ring.length }
    expect(s.heightAt(c.x, c.y)).not.toBeCloseTo(s.groundAt(c.x, c.y), 3)
  })
})
