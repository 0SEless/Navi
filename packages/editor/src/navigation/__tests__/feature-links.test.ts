import { describe, expect, it } from 'vitest'
import type { Building, Elevator, Staircase } from '@navi/core'
import { autoLinkFeature, clearFeatureLinks, featureFloor, linkCandidates, linkFeatures, unlinkFeature } from '../feature-links'

const stair = (id: string, level: number, x = 0): Staircase => ({
  id, buildingId: 'b', name: id, type: 'standard', accessible: false, fromLevel: level, toLevel: level,
  levels: { [level]: { position: { x, y: 0 }, rotation: 0 } },
} as unknown as Staircase)
const lift = (id: string, level: number): Elevator => ({
  id, buildingId: 'b', name: id, type: 'passenger', accessible: true, fromLevel: level, toLevel: level,
  levels: { [level]: { position: { x: 0, y: 0 }, rotation: 0 } },
} as unknown as Elevator)

function building(staircases: Staircase[], elevators: Elevator[] = []): Building {
  return {
    id: 'b', name: 'B', floors: [0, 1, 2].map((level) => ({ id: `f${level}`, level, label: `${level + 1}F` })),
    staircases, elevators,
  } as unknown as Building
}
const s = (b: Building, id: string) => b.staircases!.find((x) => x.id === id)!

describe('feature links', () => {
  it('featureFloor is the floor a single-floor stair is on', () => {
    expect(featureFloor(stair('a', 2))).toBe(2)
  })

  it('link sets both sides', () => {
    const b = building([stair('a', 0), stair('b', 1)])
    expect(linkFeatures(b, 'staircase', 'a', 'b')).toEqual({ ok: true })
    expect(s(b, 'a').links).toEqual({ above: 'b' })
    expect(s(b, 'b').links).toEqual({ below: 'a' })
  })

  it('linking to a stair that has a partner moves the link', () => {
    const b = building([stair('a', 0), stair('a2', 0, 9), stair('b', 1)])
    linkFeatures(b, 'staircase', 'a', 'b')
    linkFeatures(b, 'staircase', 'a2', 'b')
    expect(s(b, 'a').links?.above).toBeUndefined()
    expect(s(b, 'a2').links).toEqual({ above: 'b' })
    expect(s(b, 'b').links).toEqual({ below: 'a2' })
  })

  it('refuses a floor two apart', () => {
    const b = building([stair('a', 0), stair('c', 2)])
    expect(linkFeatures(b, 'staircase', 'a', 'c')).toMatchObject({ ok: false })
    expect(s(b, 'a').links).toBeUndefined()
  })

  it('refuses a lift for a stair', () => {
    const b = building([stair('a', 0)], [lift('l', 1)])
    expect(linkFeatures(b, 'staircase', 'a', 'l')).toMatchObject({ ok: false })
  })

  it('unlink clears both sides', () => {
    const b = building([stair('a', 0), stair('b', 1)])
    linkFeatures(b, 'staircase', 'a', 'b')
    unlinkFeature(b, 'staircase', 'b', 'below')
    expect(s(b, 'a').links?.above).toBeUndefined()
    expect(s(b, 'b').links?.below).toBeUndefined()
  })

  it('clear removes links from partners', () => {
    const b = building([stair('a', 0), stair('b', 1), stair('c', 2)])
    linkFeatures(b, 'staircase', 'a', 'b')
    linkFeatures(b, 'staircase', 'b', 'c')
    clearFeatureLinks(b, 'staircase', 'b')
    expect(s(b, 'a').links?.above).toBeUndefined()
    expect(s(b, 'c').links?.below).toBeUndefined()
    expect(s(b, 'b').links).toBeUndefined()
  })

  it('auto-link connects down to the nearest free stair below', () => {
    const b = building([stair('far', 0, 20), stair('near', 0, 2), stair('new', 1, 0)])
    autoLinkFeature(b, 'staircase', 'new')
    expect(s(b, 'new').links).toEqual({ below: 'near' })
    expect(s(b, 'near').links).toEqual({ above: 'new' })
  })

  it('auto-link connects up when the floor above has a free stair', () => {
    const b = building([stair('top', 2), stair('mid', 1), stair('low', 0)])
    autoLinkFeature(b, 'staircase', 'mid')
    expect(s(b, 'mid').links).toEqual({ below: 'low', above: 'top' })
  })

  it('auto-link connects nothing for the first stair', () => {
    const b = building([stair('only', 0)])
    autoLinkFeature(b, 'staircase', 'only')
    expect(s(b, 'only').links).toBeUndefined()
  })

  it('auto-link skips a stair below that is already connected upwards', () => {
    const b = building([stair('low', 0), stair('mid', 1), stair('new', 1, 5)])
    linkFeatures(b, 'staircase', 'low', 'mid')
    autoLinkFeature(b, 'staircase', 'new')
    expect(s(b, 'new').links).toBeUndefined()
  })

  it("candidates list only the adjacent floor's same-kind items", () => {
    const b = building([stair('a', 0), stair('b', 1), stair('c', 2)], [lift('l0', 0)])
    expect(linkCandidates(b, 'staircase', 'b', 'below').map((x) => x.id)).toEqual(['a'])
    expect(linkCandidates(b, 'staircase', 'b', 'above').map((x) => x.id)).toEqual(['c'])
    expect(linkCandidates(b, 'staircase', 'a', 'below')).toEqual([])
  })
})
