import { describe, expect, it } from 'vitest'
import { campusMaxBounds } from '../NavigationMap'

// The pan limits around the campus. Opened entrance-first (rotated, owner 2026-11-18), the phone's view sticks out of
// north-up limits and the map was forced to zoom in, cutting off the gate; rotated limits leave room for it.
const M = 1 / 111320
const campus = [{ lat: 11, lng: 122 }, { lat: 11, lng: 122 + 400 * M }, { lat: 11 + 200 * M, lng: 122 + 400 * M }, { lat: 11 + 200 * M, lng: 122 }]

describe('campusMaxBounds', () => {
  it('north-up: the campus plus a 50 m margin', () => {
    const [[w, s], [, n]] = campusMaxBounds(campus)!
    expect((11 - s) / M).toBeCloseTo(50, 0)
    expect((n - (11 + 200 * M)) / M).toBeCloseTo(50, 0)
    expect(w).toBeLessThan(122)
  })

  it('rotated: room for half the campus more on every side', () => {
    const [[, s], [, n]] = campusMaxBounds(campus, true)!
    // Half of the longer (east-west) side more than north-up; that side is 400 lng-metres at the equator, so
    // 400 x cos(latitude) metres here.
    const expected = 50 + (400 * Math.cos(((11 + 100 * M) * Math.PI) / 180)) / 2
    expect((11 - s) / M).toBeCloseTo(expected, 0)
    expect((n - (11 + 200 * M)) / M).toBeCloseTo(expected, 0)
  })
})
