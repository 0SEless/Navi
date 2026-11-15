import { describe, expect, it } from 'vitest'
import { STEEPNESS, structureProfile, usesProfile } from '../structure-profile'

// Owner 2026-11-15: "stair, then a flat area, then stair, continuous … adjust its steepness … raised manually".
describe('stair and ramp profile', () => {
  it('a stair with one landing in the middle: two flights and a flat landing halfway up', () => {
    const p = structureProfile('stairs', 0, 3, 12, { landings: [0.5] })
    expect(p.heightAt(6)).toBeCloseTo(1.5, 6) // landing centre, 1.2 m long by default
    expect(p.heightAt(5.5)).toBeCloseTo(1.5, 6)
    expect(p.heightAt(6.5)).toBeCloseTo(1.5, 6)
    const flights = p.flights.filter((f) => f.steps > 0)
    expect(flights).toHaveLength(2)
    expect(flights.map((f) => f.steps)).toEqual([9, 9]) // 1.5 m / 0.175 m risers ≈ 9 steps each
    expect(p.heightAt(0)).toBeCloseTo(0, 6)
    expect(p.heightAt(12)).toBeCloseTo(3, 6)
  })

  it('a typed landing height is kept; the flights on either side take the difference', () => {
    const p = structureProfile('stairs', 0, 3, 12, { landings: [0.5], landingHeightsM: [2] })
    expect(p.heightAt(6)).toBeCloseTo(2, 6)
    const [first, second] = p.flights.filter((f) => f.steps > 0)
    expect(first.toH - first.fromH).toBeCloseTo(2, 6)
    expect(second.toH - second.fromH).toBeCloseTo(1, 6)
  })

  it('steepness sets the step size: steep has fewer, taller steps than gentle', () => {
    const steep = structureProfile('stairs', 0, 3, 20, { steepness: 'steep' }).flights[0]
    const gentle = structureProfile('stairs', 0, 3, 20, { steepness: 'gentle' }).flights[0]
    expect(steep.steps).toBe(Math.round(3 / STEEPNESS.steep.riserM))
    expect(gentle.steps).toBe(Math.round(3 / STEEPNESS.gentle.riserM))
    expect(steep.steps).toBeLessThan(gentle.steps)
    expect(steep.treadM).toBeCloseTo(STEEPNESS.steep.treadM, 6)
  })

  it('a flight uses only the length its steps need; the rest is level at its top', () => {
    const p = structureProfile('stairs', 0, 1.75, 10, {})
    const f = p.flights[0]
    expect(f.steps).toBe(10)
    expect(f.endM - f.startM).toBeCloseTo(3, 6) // 10 treads × 0.30 m
    expect(p.heightAt(9)).toBeCloseTo(1.75, 6) // level approach at the top
    expect(p.heightAt(0.1)).toBeGreaterThan(0) // going up from the start
  })

  it('ramp steepness caps the slope; a short run shows a hint instead', () => {
    const p = structureProfile('ramp', 0, 1, 20, { steepness: 'normal' }) // 1 in 8 → 8 m of slope
    expect(p.heightAt(4)).toBeCloseTo(0.5, 6)
    expect(p.heightAt(8)).toBeCloseTo(1, 6)
    expect(p.heightAt(15)).toBeCloseTo(1, 6)
    expect(structureProfile('ramp', 0, 2, 5, { steepness: 'normal' }).hint).toMatch(/needs 16\.0 m/)
  })

  it('only structures with the new settings use the profile (old ones keep their shape)', () => {
    expect(usesProfile({ form: 'stairs' } as never)).toBe(false)
    expect(usesProfile({ form: 'ramp', landings: [0.5] } as never)).toBe(false)
    expect(usesProfile({ form: 'stairs', landings: [0.5] } as never)).toBe(true)
    expect(usesProfile({ form: 'ramp', steepness: 'gentle' } as never)).toBe(true)
  })

  it('going down works the same way', () => {
    const p = structureProfile('stairs', 3, -3, 12, { landings: [0.5] })
    expect(p.heightAt(6)).toBeCloseTo(1.5, 6)
    expect(p.heightAt(12)).toBeCloseTo(0, 6)
  })
})
