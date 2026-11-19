import { describe, expect, it } from 'vitest'
import type { LocalCoord } from '../../types/coordinates'
import type { Staircase } from '../../types/entities'
import { stairEntryPlatform } from '../stair-floors'

// Owner 2026-11-19: a stair that starts outside its floor gets an entry platform at its foot, so visitors can see they
// walk from the corridor onto the platform and up the stair ("not jump to your death").
const floors = [0, 1, 2].map((level) => ({ level, elevation: level * 3.5, height: 3.5 }))
const outline: LocalCoord[] = [{ x: -15, y: -5 }, { x: 15, y: -5 }, { x: 15, y: 5 }, { x: -15, y: 5 }]
// A Stair-tool stair climbs from its first edge (bottom step) to the opposite edge.
function stair(level: number, points: Array<[number, number]>): Staircase {
  const p = points.map(([x, y]) => ({ x, y }))
  const centre = { x: p.reduce((s, q) => s + q.x, 0) / 4, y: p.reduce((s, q) => s + q.y, 0) / 4 }
  return { id: 's', buildingId: 'b', name: 'Stair', type: 'open', accessible: false, fromLevel: level, toLevel: level + 1,
    levels: { [level]: { position: centre, rotation: 0, polygon: { points: p } }, [level + 1]: { role: 'top', position: centre, rotation: 0 } } } as unknown as Staircase
}
const round = (ring: readonly LocalCoord[]) => ring.map(({ x, y }) => [+x.toFixed(2), +y.toFixed(2)])
const box = (ring: readonly LocalCoord[]) => {
  const xs = ring.map((p) => p.x), ys = ring.map((p) => p.y)
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map((n) => +n.toFixed(2))
}

describe('entry platform at the foot of a stair outside its floor', () => {
  it('fills the gap straight back to the building when the stair climbs away from it', () => {
    // 2F stair 1 m in front of the facade (y = -5), climbing south (away from the building).
    const p = stairEntryPlatform(stair(1, [[1.2, -6], [0, -6], [0, -14], [1.2, -14]]), floors, outline)!
    expect(box(p.ring)).toEqual([0, 1.2, -6, -5])
    // No railing on the stair side or the building side; railings on the two open sides.
    expect(p.railed.filter(Boolean)).toHaveLength(2)
    expect(round(p.contact!)).toEqual(expect.arrayContaining([[0, -5], [1.2, -5]].map((q) => expect.arrayContaining(q))))
  })

  it('widens a pad sideways to the building when the stair runs along the facade', () => {
    // 2F stair outside the front, 1 m off the facade, climbing west; its foot is at its east end.
    const p = stairEntryPlatform(stair(1, [[8, -6], [8, -7.2], [0, -7.2], [0, -6]]), floors, outline)!
    // A 1.2 m pad east of the foot, reaching north to the facade.
    expect(box(p.ring)).toEqual([8, 9.2, -7.2, -5])
    expect(p.contact).not.toBeNull()
    expect(p.railed.filter(Boolean).length).toBeGreaterThanOrEqual(2)
  })

  it('keeps railings on both sides when the 1 m platform reaches past the facade onto the floor', () => {
    // Foot 0.6 m off the facade: the minimum 1 m platform ends 0.4 m inside. Its far edge is the contact; the sides,
    // half outside, keep their railings.
    const p = stairEntryPlatform(stair(1, [[1.2, -5.6], [0, -5.6], [0, -13.6], [1.2, -13.6]]), floors, outline)!
    expect(box(p.ring)).toEqual([0, 1.2, -5.6, -4.6])
    expect(p.railed).toEqual([false, true, false, true])
    expect(round(p.contact!).map(q => q[1])).toEqual([-4.6, -4.6])
  })

  // Owner 2026-11-19 screenshot: a flight along the facade got a long platform running back to a corner of the building
  // instead of a short one opening onto the corridor beside it.
  it('prefers a short pad beside the facade over a long strip back to a building corner', () => {
    // L-shaped outline: the facade at y = -5, plus a wing reaching south to y = -9 from x = 11 eastward.
    const lOutline: LocalCoord[] = [{ x: -15, y: -5 }, { x: 11, y: -5 }, { x: 11, y: -9 }, { x: 15, y: -9 }, { x: 15, y: 5 }, { x: -15, y: 5 }]
    // Flight 0.1 m off the facade, climbing west, foot at its east end (x = 8); the wing is 3 m behind the foot.
    const p = stairEntryPlatform(stair(1, [[8, -6.3], [8, -5.1], [0, -5.1], [0, -6.3]]), floors, lOutline)!
    expect(box(p.ring)).toEqual([8, 9.2, -6.3, -5])
    expect(round(p.contact!).map((q) => q[1])).toEqual([-5, -5])
  })

  it('keeps the pad short (1.2 m) for a wide stair instead of as deep as the stair is wide', () => {
    // A 3.5 m wide flight along the facade (0.1 m off it), climbing west, foot at x = 8.
    const p = stairEntryPlatform(stair(1, [[8, -8.6], [8, -5.1], [0, -5.1], [0, -8.6]]), floors, outline)!
    expect(box(p.ring)).toEqual([8, 9.2, -8.6, -5])
  })

  it('is not needed on the ground floor, nor when the foot is already on the floor', () => {
    expect(stairEntryPlatform(stair(0, [[1.2, -6], [0, -6], [0, -14], [1.2, -14]]), floors, outline)).toBeUndefined()
    expect(stairEntryPlatform(stair(1, [[1.2, 0], [0, 0], [0, -4], [1.2, -4]]), floors, outline)).toBeUndefined()
  })
})

describe('a bottom step on the floor edge opens onto the floor (owner 2026-11-19, ASU COMDEV)', () => {
  it('no pad when the foot is drawn a few centimetres past the floor edge', () => {
    // Foot 0.06 m off the facade (as COMDEV's 1F stair): it meets the floor, no pad sticking out past the facade.
    expect(stairEntryPlatform(stair(1, [[1.2, -5.06], [0, -5.06], [0, -13], [1.2, -13]]), floors, outline)).toBeUndefined()
  })

  it('still a pad when the foot is clearly off the floor (more than 0.3 m)', () => {
    expect(stairEntryPlatform(stair(1, [[1.2, -5.5], [0, -5.5], [0, -13.5], [1.2, -13.5]]), floors, outline)).toBeDefined()
  })
})
