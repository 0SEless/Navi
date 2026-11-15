import { meshFrame, pointAlong, type TerrainGrid, type TerrainMesh } from '@navi/core'

/**
 * The side view (owner 2026-11-15): one slice of ground seen from the side — a mesh row or column, or a road — with
 * the ground before (grey dashes), the result, and the points the owner drags straight up and down.
 */
type Point = { x: number; y: number }
type Height = (x: number, y: number) => number

export interface ProfileSlice {
  lengthM: number
  before: Array<{ s: number; h: number }>
  after: Array<{ s: number; h: number }>
  handles: Array<{ key: string; s: number; h: number }>
}

function sample(lengthM: number, at: (s: number) => Point, before: Height, after: Height) {
  const n = Math.max(1, Math.round(lengthM))
  const stations = Array.from({ length: n + 1 }, (_, k) => (lengthM * k) / n)
  return {
    before: stations.map((s) => { const p = at(s); return { s, h: before(p.x, p.y) } }),
    after: stations.map((s) => { const p = at(s); return { s, h: after(p.x, p.y) } }),
  }
}

export function meshLineSlice(mesh: TerrainMesh, axis: 'row' | 'col', index: number, grid: TerrainGrid, before: Height, after: Height): ProfileSlice {
  const frame = meshFrame(mesh, grid)
  const across = axis === 'row' ? mesh.colsAt : mesh.rowsAt
  const fixed = axis === 'row' ? mesh.rowsAt[index] : mesh.colsAt[index]
  const start = across[0]
  const lengthM = across[across.length - 1] - start
  const at = (s: number) => (axis === 'row' ? frame.toXY(start + s, fixed) : frame.toXY(fixed, start + s))
  const handles = across.map((value, k) => {
    const p = at(value - start)
    return { key: axis === 'row' ? `${index}:${k}` : `${k}:${index}`, s: value - start, h: after(p.x, p.y) }
  })
  return { lengthM, ...sample(lengthM, at, before, after), handles }
}

export function roadSlice(line: Point[], pins: Array<{ alongM: number; heightM: number }>, before: Height, after: Height): ProfileSlice {
  let lengthM = 0
  for (let i = 1; i < line.length; i++) lengthM += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y)
  return {
    lengthM,
    ...sample(lengthM, (s) => pointAlong(line, s), before, after),
    handles: pins.map((pin, i) => ({ key: `pin:${i}`, s: pin.alongM, h: pin.heightM })),
  }
}
