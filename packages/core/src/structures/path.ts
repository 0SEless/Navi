type Point = { x: number; y: number }

export interface StructurePath {
  /** Point at arc length s (clamped to [0, length]) and the unit normal to its left. */
  at(s: number): { p: Point; n: Point }
  /** Arc length s of the path point nearest to q, and the distance to it. */
  nearest(q: Point): { s: number; distance: number }
  length: number
}

const SAMPLES = 400

/** Quadratic Bézier from start to end through control `bend` (straight without it), arc-length parameterised. */
export function structurePath(start: Point, end: Point, bend?: Point): StructurePath {
  const control = bend ?? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const points: Point[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES
    const a = (1 - t) ** 2
    const b = 2 * t * (1 - t)
    const c = t * t
    points.push({ x: a * start.x + b * control.x + c * end.x, y: a * start.y + b * control.y + c * end.y })
  }
  const cumulative = [0]
  for (let i = 1; i <= SAMPLES; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  }
  const length = cumulative[SAMPLES]

  const segmentAt = (s: number): number => {
    let lo = 1
    let hi = SAMPLES
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cumulative[mid] < s) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  return {
    length,
    at(s: number) {
      const clamped = Math.min(Math.max(s, 0), length)
      const i = segmentAt(clamped)
      const a = points[i - 1]
      const b = points[i]
      const span = cumulative[i] - cumulative[i - 1]
      const t = span > 0 ? (clamped - cumulative[i - 1]) / span : 0
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      return { p: { x: a.x + dx * t, y: a.y + dy * t }, n: { x: -dy / len, y: dx / len } }
    },
    nearest(q: Point) {
      let best = { s: 0, distance: Infinity }
      for (let i = 1; i <= SAMPLES; i++) {
        const a = points[i - 1]
        const dx = points[i].x - a.x
        const dy = points[i].y - a.y
        const len2 = dx * dx + dy * dy
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2))
        const distance = Math.hypot(q.x - (a.x + dx * t), q.y - (a.y + dy * t))
        if (distance < best.distance) best = { s: cumulative[i - 1] + t * (cumulative[i] - cumulative[i - 1]), distance }
      }
      return best
    },
  }
}
