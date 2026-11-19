import { describe, expect, it } from 'vitest'
import { boxStairAsUShape, buildStairAssetVolumes, stairTopShape, U_STAIR_GAP } from '../stair-assets'

// Owner 2026-11-19 (ASU Tourism): a stair drawn as a box with the Stair tool can be made U-Shape, filling the same box.
// Box 1.3 m x 5.2 m climbing north (bottom step y = -9 at x 2..3.3, top end y = -3.8), floor rise 3.5 m.
const box = [{ x: 3.3, y: -9 }, { x: 2, y: -9 }, { x: 2, y: -3.8 }, { x: 3.3, y: -3.8 }]
const flight = { position: { x: 2.65, y: -6.4 }, rotation: 0, polygon: { points: box } }

describe('a drawn stair made U-Shape', () => {
  it('splits the same box into two flights side by side', () => {
    const u = boxStairAsUShape(flight, 3.5)!
    expect(u.drawing.properties).toMatchObject({ preset: 'ushape', direction: 'north', turn: 'right' })
    expect(u.drawing.properties.stepWidth).toBeCloseTo((1.3 - U_STAIR_GAP) / 2, 6)
    expect(u.drawing.properties.fromBox).toEqual(box)
    expect(u.position.x).toBeCloseTo(2.65, 6)
    expect(u.position.y).toBeCloseTo(-6.4, 6)
    // Every step and the turning landing lie inside the box.
    const solids = buildStairAssetVolumes([{ id: 's', ...u, height: 3.5 }], 0).collection.features
      .filter((f) => f.properties?.partType === 'step' || f.properties?.partType === 'landing')
    const points = solids.flatMap((f) => f.geometry.coordinates[0] as number[][])
    expect(Math.min(...points.map((p) => p[0]))).toBeGreaterThanOrEqual(2 - 1e-6)
    expect(Math.max(...points.map((p) => p[0]))).toBeLessThanOrEqual(3.3 + 1e-6)
    expect(Math.min(...points.map((p) => p[1]))).toBeGreaterThanOrEqual(-9 - 1e-6)
    expect(Math.max(...points.map((p) => p[1]))).toBeLessThanOrEqual(-3.8 + 1e-6)
  })

  it('arrives back at the foot end of the box, facing away from the turn', () => {
    const u = boxStairAsUShape(flight, 3.5)!
    const top = stairTopShape({ id: 's', ...u, height: 3.5, fromLevel: 0 })!
    const ys = top.landing.map((p) => p[1])
    // The arrival platform is at the bottom-step end (y = -9), not at the far end (y = -3.8).
    expect(Math.max(...ys)).toBeLessThanOrEqual(-9 + 1e-6)
  })

  it('works for a box drawn at an angle and in any point order the Stair tool gives', () => {
    const turn = (p: { x: number; y: number }) => ({ x: p.x * Math.cos(0.3) - p.y * Math.sin(0.3), y: p.x * Math.sin(0.3) + p.y * Math.cos(0.3) })
    const u = boxStairAsUShape({ ...flight, polygon: { points: box.map(turn) } }, 3.5)!
    const top = stairTopShape({ id: 's', ...u, height: 3.5, fromLevel: 0 })!
    // Turned back by -0.3 rad into the box's own frame.
    const back = top.landing.map(([x, y]) => ({ x: x * Math.cos(-0.3) - y * Math.sin(-0.3), y: x * Math.sin(-0.3) + y * Math.cos(-0.3) }))
    expect(Math.max(...back.map((p) => p.y))).toBeLessThanOrEqual(-9 + 1e-6)
  })

  it('turns the other way on request', () => {
    const right = boxStairAsUShape(flight, 3.5)!
    const left = boxStairAsUShape(flight, 3.5, 'left')!
    const xs = (u: NonNullable<ReturnType<typeof boxStairAsUShape>>) => stairTopShape({ id: 's', ...u, height: 3.5, fromLevel: 0 })!.landing.map((p) => p[0])
    expect(Math.min(...xs(left))).not.toBeCloseTo(Math.min(...xs(right)), 1)
    expect(left.drawing.properties.turn).toBe('left')
  })

  it('refuses a box too narrow for two flights, or not a box', () => {
    expect(boxStairAsUShape({ ...flight, polygon: { points: [{ x: 3, y: -9 }, { x: 2, y: -9 }, { x: 2, y: -3.8 }, { x: 3, y: -3.8 }] } }, 3.5)).toBeUndefined()
    expect(boxStairAsUShape({ position: flight.position, rotation: 0 }, 3.5)).toBeUndefined()
  })
})
