import { deriveRooms } from '@navi/editor/src/geometry/room-derivation'
import { booleanPointInPolygon, point, polygon } from '@turf/turf'
import type { LocalCoord, Wall } from '@navi/core'

export function enclosedFloorAreas(walls: readonly Wall[]): LocalCoord[][] {
  return deriveRooms(walls.map(wall => ({ id: wall.id, sourceWallId: wall.id, start: wall.start, end: wall.end })), [])
    .map(face => face.polygon.points)
}

/** Portions of the well boundary with a floor on the outside and no solid wall guarding it. */
export function stairWellGuardSegments(well: number[][], areas: LocalCoord[][], walls: readonly Wall[], otherWells: number[][][], openings: (wallId: string) => Array<{ start: number; end: number }>) {
  if (!areas.length || well.length !== 4) return []
  const closed = (ring: number[][]) => polygon([[...ring, ring[0]]])
  const faces = areas.filter(ring => ring.length >= 3).map(ring => closed(ring.map(({ x, y }) => [x, y])))
  const cuts = otherWells.filter(ring => ring.length >= 3).map(closed)
  const middle = well.reduce(([x, y], p) => [x + p[0] / 4, y + p[1] / 4], [0, 0])
  const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx
  // The last edge across the stair is the travel seam onto the landing, not a drop to guard.
  return [0, 1, 3].flatMap(edge => {
    const [x, y] = well[edge], [ex, ey] = well[(edge + 1) % 4]
    const dx = ex - x, dy = ey - y, length = Math.hypot(dx, dy)
    if (length < 0.05) return []
    const side = Math.sign(cross(dx, dy, middle[0] - x, middle[1] - y))
    const sx = x + side * dy / length * 0.025, sy = y - side * dx / length * 0.025
    const boundaries = [0, 1]
    for (const face of [...faces, ...cuts]) {
      const ring = face.geometry.coordinates[0]
      for (let i = 1; i < ring.length; i++) {
        const [px, py] = ring[i - 1], [qx, qy] = ring[i]
        const wx = qx - px, wy = qy - py, det = cross(dx, dy, wx, wy)
        if (Math.abs(det) < 1e-8) continue
        const t = cross(px - sx, py - sy, wx, wy) / det
        const u = cross(px - sx, py - sy, dx, dy) / det
        if (t > 0 && t < 1 && u >= 0 && u <= 1) boundaries.push(t)
      }
    }
    const protectedSpans: Array<[number, number]> = []
    for (const wall of walls) {
      if (wall.height < 0.8 && !wall.guardStyle) continue
      const project = ({ x: px, y: py }: LocalCoord) => ((px - x) * dx + (py - y) * dy) / (length * length)
      const distance = ({ x: px, y: py }: LocalCoord) => Math.abs(cross(dx, dy, px - x, py - y)) / length
      if (Math.max(distance(wall.start), distance(wall.end)) > wall.thickness / 2 + 0.05) continue
      const a = project(wall.start), b = project(wall.end)
      const low = Math.max(0, Math.min(a, b)), high = Math.min(1, Math.max(a, b))
      if (low < high) {
        boundaries.push(low, high)
        const wallLength = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
        if (!(wallLength > 0)) continue
        const gaps = openings(wall.id).flatMap(({ start, end }) => {
          const p = a + (b - a) * start / wallLength, q = a + (b - a) * end / wallLength
          const from = Math.max(low, Math.min(p, q)), to = Math.min(high, Math.max(p, q))
          return to > from ? [[from, to] as const] : []
        }).sort((left, right) => left[0] - right[0])
        let cursor = low
        for (const [from, to] of gaps) {
          boundaries.push(from, to)
          if (from > cursor) protectedSpans.push([cursor, from])
          cursor = Math.max(cursor, to)
        }
        if (cursor < high) protectedSpans.push([cursor, high])
      }
    }
    boundaries.sort((a, b) => a - b)
    const segments: Array<[number, number]> = []
    for (let index = 1; index < boundaries.length; index++) {
      const a = boundaries[index - 1], b = boundaries[index]
      if (b - a < 1e-7) continue
      const t = (a + b) / 2, sample = point([sx + t * dx, sy + t * dy])
      if (protectedSpans.some(([low, high]) => t >= low && t <= high) ||
          !faces.some(face => booleanPointInPolygon(sample, face)) ||
          cuts.some(cut => booleanPointInPolygon(sample, cut))) continue
      const previous = segments.at(-1)
      if (previous && previous[1] === a) previous[1] = b
      else segments.push([a, b])
    }
    const at = (t: number) => ({ x: x + dx * t, y: y + dy * t })
    return segments.flatMap(([a, b], index) => (b - a) * length >= 0.05
      ? [{ edge, index, from: at(a), to: at(b) }] : [])
  })
}
