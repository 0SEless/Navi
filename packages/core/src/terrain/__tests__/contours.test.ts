import { describe, expect, it } from 'vitest'
import { contourSegments } from '../contours'

describe('contourSegments', () => {
  it('a cone gives a closed ring at each level, at the right radius', () => {
    const cone = (x: number, y: number) => 10 - Math.hypot(x, y) // 10 m at the centre, 0 m at radius 10
    const levels = contourSegments(cone, { minX: -10, minY: -10, maxX: 10, maxY: 10 }, { step: 5, cell: 0.5 })
    expect(levels.map((l) => l.elevationM)).toEqual([0, 5])
    const five = levels.find((l) => l.elevationM === 5)!
    expect(five.segments.length).toBeGreaterThan(20)
    for (const [a, b] of five.segments) {
      expect(Math.hypot(a.x, a.y)).toBeCloseTo(5, 0)
      expect(Math.hypot(b.x, b.y)).toBeCloseTo(5, 0)
    }
  })

  it('flat ground gives no lines', () => {
    expect(contourSegments(() => 2.5, { minX: 0, minY: 0, maxX: 10, maxY: 10 }, { step: 1, cell: 1 })).toEqual([])
  })
})
