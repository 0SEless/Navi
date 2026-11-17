import { describe, expect, it } from 'vitest'
import { openingBearing } from '../opening-view'

// Owner 2026-11-18: open the map entrance-first, in portrait (phones are not landscape): the Entrance Gate at the
// bottom of the screen and the campus running up from it.

const M = 1 / 111320
const square = [{ lat: 11 - 100 * M, lng: 122 - 100 * M }, { lat: 11 - 100 * M, lng: 122 + 100 * M }, { lat: 11 + 100 * M, lng: 122 + 100 * M }, { lat: 11 + 100 * M, lng: 122 - 100 * M }]
const gate = (lat: number, lng: number) => ({ label: 'ENTRANCE GATE', position: { lat, lng } })

describe('openingBearing', () => {
  it('gate on the south edge: look north (0), so the gate is at the bottom', () => {
    expect(openingBearing([gate(11 - 100 * M, 122)], square)).toBeCloseTo(0, 0)
  })

  it('gate on the west edge: look east (90)', () => {
    expect(openingBearing([gate(11, 122 - 100 * M)], square)).toBeCloseTo(90, 0)
  })

  it('also finds a "Main Gate"; ignores other POIs', () => {
    expect(openingBearing([{ label: 'Library', position: { lat: 11, lng: 122 } }, gate(11 + 100 * M, 122)].map((p, i) => (i === 1 ? { ...p, label: 'Main Gate' } : p)), square)).toBeCloseTo(180, 0)
  })

  it('no gate or no boundary: no bearing (north-up as before)', () => {
    expect(openingBearing([{ label: 'Library', position: { lat: 11, lng: 122 } }], square)).toBeUndefined()
    expect(openingBearing([gate(11, 122 - 100 * M)], [])).toBeUndefined()
  })
})
