import { describe, expect, it } from 'vitest'
import { localRectangleFromDrag, normalizeLocalRectangle, rectangleCenter, resizeRectangleFootprint, rotateRectangleFootprint } from './rectangle-authoring'

describe('shared rectangle authoring contract', () => {
  it('resizes a thin attached door symmetrically without moving its center', () => {
    const points = localRectangleFromDrag({ x: 2.5, y: -0.075 }, { x: 3.5, y: 0.075 })
    const resized = resizeRectangleFootprint(points, 2, { x: 4, y: 0.5 }, { minimumDepth: 0.01, fixedCenter: true })
    expect(resized).not.toBeNull()
    const expected=[{ x: 2, y: -0.5 }, { x: 4, y: -0.5 }, { x: 4, y: 0.5 }, { x: 2, y: 0.5 }]
    resized!.forEach((point,index)=>{expect(point.x).toBeCloseTo(expected[index].x);expect(point.y).toBeCloseTo(expected[index].y)})
    expect(rectangleCenter(resized!)).toEqual({ x: 3, y: 0 })
    expect(points[0]).toEqual({ x: 2.5, y: -0.075 })
  })

  it('keeps diagonal door axes and center fixed when resizing any corner', () => {
    const points = rotateRectangleFootprint(localRectangleFromDrag({ x: 2.5, y: -0.075 }, { x: 3.5, y: 0.075 }), Math.PI / 4)
    const resized = resizeRectangleFootprint(points, 0, { x: 3 - Math.SQRT2 / 4, y: -3 * Math.SQRT2 / 4 }, { minimumDepth: 0.01, fixedCenter: true })!
    expect(resized).not.toBeNull()
    expect(rectangleCenter(resized).x).toBeCloseTo(3)
    expect(rectangleCenter(resized).y).toBeCloseTo(0)
    expect(Math.hypot(resized[1].x-resized[0].x,resized[1].y-resized[0].y)).toBeCloseTo(2)
    expect(Math.hypot(resized[3].x-resized[0].x,resized[3].y-resized[0].y)).toBeCloseTo(1)
  })
  it('normalizes drag direction and returns a stable corner order', () => {
    expect(normalizeLocalRectangle({ x: 8, y: 4 }, { x: 2, y: 1 })).toEqual({ min: { x: 2, y: 1 }, max: { x: 8, y: 4 } })
    expect(localRectangleFromDrag({ x: 8, y: 4 }, { x: 2, y: 1 })).toEqual([
      { x: 2, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 4 }, { x: 2, y: 4 },
    ])
  })

  it('moves one rectangle corner while preserving the opposite corner and right angles', () => {
    const points = localRectangleFromDrag({ x: 0, y: 0 }, { x: 4, y: 2 })
    const resized = resizeRectangleFootprint(points, 2, { x: 8, y: 4 })
    expect(resized).toEqual([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 0, y: 4 }])
  })

  it('rotates a rectangle around its center without changing identity or size', () => {
    const points = localRectangleFromDrag({ x: 0, y: 0 }, { x: 4, y: 2 })
    const rotated = rotateRectangleFootprint(points, Math.PI / 2)
    expect(rectangleCenter(rotated)).toEqual({ x: 2, y: 1 })
    expect(rotated[0].x).toBeCloseTo(3)
    expect(rotated[0].y).toBeCloseTo(-1)
    expect(Math.hypot(rotated[1].x - rotated[0].x, rotated[1].y - rotated[0].y)).toBeCloseTo(4)
  })
})
