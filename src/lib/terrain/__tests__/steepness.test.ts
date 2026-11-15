import { describe, expect, it } from 'vitest'
import { steepnessImage } from '../steepness'

function field(slopePerMetre: number) {
  const cols = 20
  const rows = 10
  const heights = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = c * slopePerMetre
  return { area: { x0: 0, y0: 0, cols, rows }, heights } as never
}
const pixel = (img: ReturnType<typeof steepnessImage>, x: number, y: number) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4))

describe('Too steep colours', () => {
  it('flat ground stays clear', () => {
    const img = steepnessImage(field(0))
    expect(img.width).toBe(20)
    expect(img.height).toBe(10)
    expect(img.data.every((v, i) => i % 4 !== 3 || v === 0)).toBe(true)
  })

  it('steeper than 1 in 4 is amber; steeper than 1 in 2 is red', () => {
    expect(pixel(steepnessImage(field(1 / 3)), 10, 5)).toEqual([239, 159, 39, 140])
    expect(pixel(steepnessImage(field(1 / 1.5)), 10, 5)).toEqual([226, 75, 74, 153])
    expect(pixel(steepnessImage(field(0.2)), 10, 5)[3]).toBe(0)
  })
})
