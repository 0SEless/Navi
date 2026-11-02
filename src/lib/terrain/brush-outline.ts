import type { BrushSettings } from '@navi/core'

/** Closed outline of the brush around `center` (local metres), for the cursor on the map. */
export function brushOutline(s: BrushSettings, center: { x: number; y: number }): Array<{ x: number; y: number }> {
  const a = s.sizeM / 2
  const b = s.shape === 'oval' || s.shape === 'rectangle' ? a * s.aspect : a
  let shape: Array<{ x: number; y: number }>
  if (s.shape === 'rectangle') shape = [{ x: -a, y: -b }, { x: a, y: -b }, { x: a, y: b }, { x: -a, y: b }]
  else if (s.shape === 'triangle') shape = [0, 1, 2].map((k) => ({ x: a * Math.cos(Math.PI / 2 + (k * 2 * Math.PI) / 3), y: a * Math.sin(Math.PI / 2 + (k * 2 * Math.PI) / 3) }))
  else shape = Array.from({ length: 48 }, (_, k) => ({ x: a * Math.cos((k * 2 * Math.PI) / 48), y: b * Math.sin((k * 2 * Math.PI) / 48) }))
  const angle = (s.rotationDeg * Math.PI) / 180
  const turned = shape.map((p) => ({
    x: center.x + p.x * Math.cos(angle) - p.y * Math.sin(angle),
    y: center.y + p.x * Math.sin(angle) + p.y * Math.cos(angle),
  }))
  return [...turned, turned[0]]
}
