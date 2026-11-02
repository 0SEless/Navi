type Point = { x: number; y: number }

export interface ContourLevel {
  elevationM: number
  segments: Array<[Point, Point]>
}

/**
 * Contour segments by marching squares over a `cell`-metre lattice of `sample(x, y)` (local metres).
 * Levels are every `step` metres; a node counts as above a level when strictly greater than it.
 * Only levels that produce at least one segment are returned, lowest first.
 */
export function contourSegments(
  sample: (x: number, y: number) => number,
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  opts: { step: number; cell: number },
): ContourLevel[] {
  const { step, cell } = opts
  const cols = Math.max(1, Math.round((bbox.maxX - bbox.minX) / cell))
  const rows = Math.max(1, Math.round((bbox.maxY - bbox.minY) / cell))
  const values = new Float64Array((cols + 1) * (rows + 1))
  let min = Infinity
  let max = -Infinity
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const v = sample(bbox.minX + i * cell, bbox.minY + j * cell)
      values[j * (cols + 1) + i] = v
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  if (!(max > min)) return []

  const at = (i: number, j: number) => values[j * (cols + 1) + i]
  const point = (i: number, j: number): Point => ({ x: bbox.minX + i * cell, y: bbox.minY + j * cell })
  const lerp = (a: Point, b: Point, va: number, vb: number, level: number): Point => {
    const t = va === vb ? 0.5 : (level - va) / (vb - va)
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  }

  const levels: ContourLevel[] = []
  for (let level = Math.ceil(min / step) * step; level <= max; level += step) {
    const segments: Array<[Point, Point]> = []
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const corners = [point(i, j), point(i + 1, j), point(i + 1, j + 1), point(i, j + 1)]
        const v = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]
        const crossings: Point[] = []
        for (let e = 0; e < 4; e++) {
          const a = e
          const b = (e + 1) % 4
          if (v[a] > level !== v[b] > level) crossings.push(lerp(corners[a], corners[b], v[a], v[b], level))
        }
        if (crossings.length === 2) segments.push([crossings[0], crossings[1]])
        else if (crossings.length === 4) {
          segments.push([crossings[0], crossings[1]])
          segments.push([crossings[2], crossings[3]])
        }
      }
    }
    if (segments.length > 0) levels.push({ elevationM: Math.round(level * 1000) / 1000 + 0, segments }) // + 0 turns -0 into 0
  }
  return levels
}
