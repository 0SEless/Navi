/**
 * Road grading (owner 2026-11-15): the height along a graded road is the ground along its centreline, smoothed over a
 * window from 4 m (Follow hill) to 60 m (Smooth), passing exactly through pins (and typed end heights). Where graded
 * roads meet they share one height, added as pins on both.
 */
type Point = { x: number; y: number }
export type GradePin = { alongM: number; heightM: number }

export interface RoadProfile {
  lengthM: number
  heightAtAlong(s: number): number
}

const STEP_M = 1

function lengths(line: Point[]): number[] {
  const out = [0]
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y))
  return out
}

/** The point at distance `s` along the line. */
export function pointAlong(line: Point[], s: number): Point {
  const ls = lengths(line)
  const total = ls[ls.length - 1]
  if (!(total > 0)) return line[0]
  const t = Math.max(0, Math.min(total, s))
  let i = 1
  while (i < ls.length - 1 && ls[i] < t) i++
  const seg = ls[i] - ls[i - 1] || 1
  const f = (t - ls[i - 1]) / seg
  return { x: line[i - 1].x + (line[i].x - line[i - 1].x) * f, y: line[i - 1].y + (line[i].y - line[i - 1].y) * f }
}

/** Distance along the line of the point on it nearest `p`, and how far `p` is from the line. */
export function alongOf(line: Point[], p: Point): { along: number; distance: number } {
  const ls = lengths(line)
  let best = { along: 0, distance: Infinity }
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const dx = line[i].x - a.x
    const dy = line[i].y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    const distance = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    if (distance < best.distance) best = { along: ls[i - 1] + t * (ls[i] - ls[i - 1]), distance }
  }
  return best
}

function boxBlur(values: number[], radius: number): number[] {
  if (radius < 1) return values
  return values.map((_, i) => {
    let sum = 0
    let count = 0
    for (let k = Math.max(0, i - radius); k <= Math.min(values.length - 1, i + radius); k++) {
      sum += values[k]
      count++
    }
    return sum / count
  })
}

export function roadGradeProfile(
  line: Point[],
  groundAt: (x: number, y: number) => number,
  grade: { smoothness: number; pins?: GradePin[] },
  ends: { start?: number; end?: number },
): RoadProfile {
  const total = lengths(line).at(-1) ?? 0
  const lengthM = total > 0 ? total : 0
  const n = Math.max(1, Math.round(lengthM / STEP_M))
  const stations = Array.from({ length: n + 1 }, (_, k) => (lengthM * k) / n)
  const raw = stations.map((s) => {
    const p = pointAlong(line, s)
    return groundAt(p.x, p.y)
  })
  const smoothness = Math.max(0, Math.min(1, Number.isFinite(grade.smoothness) ? grade.smoothness : 0.5))
  const window = Math.min(lengthM, 4 + 56 * smoothness)
  const radius = Math.round(window / 2 / (lengthM / n || 1))
  // Extend each end by its local straight trend so the window never runs short there (no wiggle at the ends).
  const pad = 2 * radius
  const trend = (values: number[]) => {
    const k = values.length
    if (k < 2) return { a: values[0] ?? 0, b: 0 }
    const mx = (k - 1) / 2
    const my = values.reduce((t, v) => t + v, 0) / k
    let num = 0
    let den = 0
    values.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2 })
    const b = den > 0 ? num / den : 0
    return { a: my - b * mx, b }
  }
  const head = trend(raw.slice(0, Math.min(raw.length, pad + 1)))
  const tailValues = raw.slice(Math.max(0, raw.length - pad - 1))
  const tail = trend(tailValues)
  const padded = [
    ...Array.from({ length: pad }, (_, i) => head.a + head.b * (i - pad)),
    ...raw,
    ...Array.from({ length: pad }, (_, i) => tail.a + tail.b * (tailValues.length + i)),
  ]
  const smoothed = boxBlur(boxBlur(padded, radius), radius).slice(pad, pad + raw.length)
  const at = (values: number[], s: number) => {
    if (n === 0 || !(lengthM > 0)) return values[0]
    const f = Math.max(0, Math.min(n, (s / lengthM) * n))
    const k = Math.min(n - 1, Math.floor(f))
    return values[k] + (values[k + 1] - values[k]) * (f - k)
  }
  // Exact through the pins and given ends: the residuals are interpolated between them and fade out beyond the
  // outermost ones over the window.
  const targets: GradePin[] = [
    ...(Number.isFinite(ends.start) ? [{ alongM: 0, heightM: ends.start as number }] : []),
    ...(grade.pins ?? []).filter((p) => Number.isFinite(p.alongM) && Number.isFinite(p.heightM)),
    ...(Number.isFinite(ends.end) ? [{ alongM: lengthM, heightM: ends.end as number }] : []),
  ].map((p) => ({ alongM: Math.max(0, Math.min(lengthM, p.alongM)), heightM: p.heightM })).sort((a, b) => a.alongM - b.alongM)
  const residuals = targets.map((p) => ({ s: p.alongM, r: p.heightM - at(smoothed, p.alongM) }))
  const fade = Math.max(window, 1)
  const correction = (s: number) => {
    if (residuals.length === 0) return 0
    const first = residuals[0]
    const last = residuals[residuals.length - 1]
    if (s <= first.s) return first.r * Math.max(0, 1 - (first.s - s) / fade)
    if (s >= last.s) return last.r * Math.max(0, 1 - (s - last.s) / fade)
    let i = 1
    while (i < residuals.length - 1 && residuals[i].s < s) i++
    const a = residuals[i - 1]
    const b = residuals[i]
    const span = b.s - a.s || 1
    return a.r + ((b.r - a.r) * (s - a.s)) / span
  }
  return { lengthM, heightAtAlong: (s) => at(smoothed, s) + correction(s) }
}

/** Shared heights where graded roads meet: a road end within another road's half width (+0.5 m) of its line. */
export function junctionPins(roads: Array<{ id: string; line: Point[]; halfWidth: number; profile: RoadProfile; pins: GradePin[] }>): Map<string, GradePin[]> {
  const out = new Map<string, GradePin[]>()
  const add = (id: string, pin: GradePin) => out.set(id, [...(out.get(id) ?? []), pin])
  const pinNear = (pins: GradePin[], s: number) => pins.find((p) => Math.abs(p.alongM - s) < 0.5)?.heightM
  for (const road of roads) {
    const ends = [{ s: 0, p: road.line[0] }, { s: road.profile.lengthM, p: road.line[road.line.length - 1] }]
    for (const end of ends) {
      for (const other of roads) {
        if (other.id === road.id) continue
        const hit = alongOf(other.line, end.p)
        if (hit.distance > other.halfWidth + 0.5) continue
        const height = pinNear(road.pins, end.s) ?? pinNear(other.pins, hit.along)
          ?? (road.profile.heightAtAlong(end.s) + other.profile.heightAtAlong(hit.along)) / 2
        add(road.id, { alongM: end.s, heightM: height })
        add(other.id, { alongM: hit.along, heightM: height })
        break
      }
    }
  }
  // Roads that cross through each other (an X, not an end on the other road) share one height where their
  // centre lines meet (owner 2026-11-15: a 1.2 m step where two platform roads crossed).
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      for (const hit of crossings(roads[i].line, roads[j].line)) {
        const a = roads[i]
        const b = roads[j]
        if (hit.sa < 0.5 || hit.sa > a.profile.lengthM - 0.5 || hit.sb < 0.5 || hit.sb > b.profile.lengthM - 0.5) continue // an end: handled above
        const height = pinNear(a.pins, hit.sa) ?? pinNear(b.pins, hit.sb) ?? (a.profile.heightAtAlong(hit.sa) + b.profile.heightAtAlong(hit.sb)) / 2
        add(a.id, { alongM: hit.sa, heightM: height })
        add(b.id, { alongM: hit.sb, heightM: height })
      }
    }
  }
  return out
}

/** Where two polylines' segments cross, as distances along each. */
function crossings(a: Point[], b: Point[]): Array<{ sa: number; sb: number }> {
  const out: Array<{ sa: number; sb: number }> = []
  let accA = 0
  for (let i = 1; i < a.length; i++) {
    const p = a[i - 1]
    const r = { x: a[i].x - p.x, y: a[i].y - p.y }
    const lenA = Math.hypot(r.x, r.y)
    let accB = 0
    for (let k = 1; k < b.length; k++) {
      const q = b[k - 1]
      const t2 = { x: b[k].x - q.x, y: b[k].y - q.y }
      const lenB = Math.hypot(t2.x, t2.y)
      const den = r.x * t2.y - r.y * t2.x
      if (Math.abs(den) > 1e-9) {
        const u = ((q.x - p.x) * t2.y - (q.y - p.y) * t2.x) / den
        const v = ((q.x - p.x) * r.y - (q.y - p.y) * r.x) / den
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) out.push({ sa: accA + u * lenA, sb: accB + v * lenB })
      }
      accB += lenB
    }
    accA += lenA
  }
  return out
}

/**
 * A road as a platform (owner 2026-11-15: "always flat … it will not curve or look like a wave"): straight grades
 * between its control points — its start and end (typed ends, else the ground there), its pins and any shared
 * crossing heights. The hill's bumps never show on it.
 */
export function platformProfile(
  line: Point[],
  groundAt: (x: number, y: number) => number,
  pins: GradePin[],
  ends: { start?: number; end?: number },
): RoadProfile {
  const lengthM = Math.max(0, lengths(line).at(-1) ?? 0)
  const a = line[0]
  const b = line[line.length - 1]
  const points: GradePin[] = [...pins]
    .filter((p) => Number.isFinite(p.alongM) && Number.isFinite(p.heightM))
    .map((p) => ({ alongM: Math.min(Math.max(p.alongM, 0), lengthM), heightM: p.heightM }))
  const near = (s: number) => points.some((p) => Math.abs(p.alongM - s) < 0.5)
  if (!near(0)) points.push({ alongM: 0, heightM: Number.isFinite(ends.start) ? ends.start as number : groundAt(a.x, a.y) })
  if (!near(lengthM)) points.push({ alongM: lengthM, heightM: Number.isFinite(ends.end) ? ends.end as number : groundAt(b.x, b.y) })
  points.sort((p, q) => p.alongM - q.alongM)
  return {
    lengthM,
    heightAtAlong(s: number): number {
      const x = Math.min(Math.max(s, 0), lengthM)
      if (x <= points[0].alongM) return points[0].heightM
      for (let i = 1; i < points.length; i++) {
        const p = points[i - 1]
        const q = points[i]
        if (x <= q.alongM) return q.alongM - p.alongM < 1e-9 ? q.heightM : p.heightM + ((q.heightM - p.heightM) * (x - p.alongM)) / (q.alongM - p.alongM)
      }
      return points[points.length - 1].heightM
    },
  }
}

type JunctionRoad = { id: string; line: Point[]; halfWidth: number; profile: RoadProfile; pins: GradePin[] }
export interface JunctionShape {
  /** Heights the road must pass through (junction edges and crossing squares). */
  pins: GradePin[]
  /** Stretches (along this road) inside another road's surface: that road's surface is the ground there. */
  yields: Array<[number, number]>
}

/** How far from `fromS` along `line` (towards `dir`) the line stays inside `other`'s surface. */
function exitDistance(line: Point[], fromS: number, dir: 1 | -1, lengthM: number, other: JunctionRoad): number {
  const limit = other.halfWidth * 4 + 2
  for (let d = 0; d <= limit; d += 0.1) {
    const s = fromS + dir * d
    if (s < 0 || s > lengthM) return d
    if (alongOf(other.line, pointAlong(line, s)).distance > other.halfWidth) return d
  }
  return limit
}

/**
 * Seamless junctions (owner 2026-11-15: steps where roads meet).
 * T (a road ends on another): the main road is unchanged; the side road yields its surface inside the main road and
 * starts at the main road's edge, at the main road's height there.
 * X (two roads cross): both are level across the crossing square, at one shared height.
 */
export function junctionShapes(roads: JunctionRoad[]): Map<string, JunctionShape> {
  const out = new Map<string, JunctionShape>()
  const shape = (id: string) => { let v = out.get(id); if (!v) { v = { pins: [], yields: [] }; out.set(id, v) } return v }
  for (const road of roads) {
    const lengthM = road.profile.lengthM
    for (const [endS, dir] of [[0, 1], [lengthM, -1]] as Array<[number, 1 | -1]>) {
      const endP = pointAlong(road.line, endS)
      let host: JunctionRoad | null = null
      let best = Infinity
      for (const other of roads) {
        if (other.id === road.id) continue
        const { distance } = alongOf(other.line, endP)
        if (distance <= other.halfWidth + 0.5 && distance < best) { best = distance; host = other }
      }
      if (!host) continue
      const d = exitDistance(road.line, endS, dir, lengthM, host)
      const edgeS = Math.min(Math.max(endS + dir * d, 0), lengthM)
      const edgeH = host.profile.heightAtAlong(alongOf(host.line, pointAlong(road.line, edgeS)).along)
      const v = shape(road.id)
      v.pins.push({ alongM: edgeS, heightM: edgeH })
      v.yields.push(dir === 1 ? [0, edgeS] : [edgeS, lengthM])
    }
  }
  const pinNear = (pins: GradePin[], s: number) => pins.find((p) => Math.abs(p.alongM - s) < 0.5)?.heightM
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      const a = roads[i]
      const b = roads[j]
      for (const hit of crossings(a.line, b.line)) {
        if (hit.sa < 0.5 || hit.sa > a.profile.lengthM - 0.5 || hit.sb < 0.5 || hit.sb > b.profile.lengthM - 0.5) continue
        const h = pinNear(a.pins, hit.sa) ?? pinNear(b.pins, hit.sb) ?? (a.profile.heightAtAlong(hit.sa) + b.profile.heightAtAlong(hit.sb)) / 2
        for (const [r, s0, o] of [[a, hit.sa, b], [b, hit.sb, a]] as Array<[JunctionRoad, number, JunctionRoad]>) {
          const len = r.profile.lengthM
          const before = Math.max(0, s0 - exitDistance(r.line, s0, -1, len, o))
          const after = Math.min(len, s0 + exitDistance(r.line, s0, 1, len, o))
          shape(r.id).pins.push({ alongM: before, heightM: h }, { alongM: s0, heightM: h }, { alongM: after, heightM: h })
        }
      }
    }
  }
  return out
}
