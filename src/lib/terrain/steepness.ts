import type { HeightField } from '@navi/core'

/**
 * Too steep view (owner 2026-11-15): colours ground steeper than 1 in 4 amber and steeper than 1 in 2 red, so
 * slopes people cannot comfortably walk stand out. One pixel per 1 m height-field cell; the top image row is the
 * field's highest y (north), as an image source expects.
 */
export const STEEP_AMBER = 0.25
export const STEEP_RED = 0.5

export function steepnessImage(field: Pick<HeightField, 'area' | 'heights'>): { width: number; height: number; data: Uint8ClampedArray } {
  const { cols, rows } = field.area
  const h = field.heights
  const data = new Uint8ClampedArray(cols * rows * 4)
  const at = (c: number, r: number) => h[Math.max(0, Math.min(rows - 1, r)) * cols + Math.max(0, Math.min(cols - 1, c))]
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dx = (at(c + 1, r) - at(c - 1, r)) / (c > 0 && c < cols - 1 ? 2 : 1)
      const dy = (at(c, r + 1) - at(c, r - 1)) / (r > 0 && r < rows - 1 ? 2 : 1)
      const slope = Math.hypot(dx, dy)
      if (slope < STEEP_AMBER - 1e-6) continue
      const o = ((rows - 1 - r) * cols + c) * 4
      if (slope >= STEEP_RED - 1e-6) data.set([226, 75, 74, 153], o)
      else data.set([239, 159, 39, 140], o)
    }
  }
  return { width: cols, height: rows, data }
}
