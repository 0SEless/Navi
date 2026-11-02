import type { StructurePath } from './path'
import { stairShape } from './stair-shape'
import type { Structure, StructureForm, StructureMaterial, StructurePreset } from './types'

type V3 = [number, number, number]

export interface MeshInput {
  path: StructurePath
  startH: number
  endH: number
  form: StructureForm
  width: number
  underneath: 'open' | 'solid'
  railings: Structure['railings']
  flight?: Structure['flight']
  landings?: number[]
  groundAt(x: number, y: number): number
  look: StructurePreset['look']
  materials: Record<string, StructureMaterial>
}

const UNDERSIDE_THICKNESS = 0.2
const SOLID_DEPTH = 0.4
const TOP_RAIL = 0.95
const MID_RAIL = 0.45
const RAIL_INSET = 0.06

function rgb(hex: string): V3 {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] ?? '999999'
  return [parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255]
}

function meshWriter() {
  const out: number[] = []
  const normal = (a: V3, b: V3, c: V3): V3 => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n: V3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
    const len = Math.hypot(...n) || 1
    return [n[0] / len, n[1] / len, n[2] / len]
  }
  const tri = (a: V3, b: V3, c: V3, color: V3) => {
    const n = normal(a, b, c)
    for (const p of [a, b, c]) out.push(...p, ...n, ...color)
  }
  const quad = (a: V3, b: V3, c: V3, d: V3, color: V3) => {
    tri(a, b, c, color)
    tri(a, c, d, color)
  }
  /** A box between two centre points: half-width `hw` sideways, half-height `hh` vertically. */
  const tube = (p0: V3, p1: V3, hw: number, hh: number, color: V3) => {
    const dx = p1[0] - p0[0]
    const dy = p1[1] - p0[1]
    const len = Math.hypot(dx, dy)
    const n = len < 1e-9 ? [1, 0] : [-dy / len, dx / len]
    const corner = (p: V3, side: number, up: number): V3 => [p[0] + n[0] * hw * side, p[1] + n[1] * hw * side, p[2] + hh * up]
    const a = [corner(p0, 1, 1), corner(p0, -1, 1), corner(p0, -1, -1), corner(p0, 1, -1)]
    const b = [corner(p1, 1, 1), corner(p1, -1, 1), corner(p1, -1, -1), corner(p1, 1, -1)]
    for (let i = 0; i < 4; i++) quad(a[i], b[i], b[(i + 1) % 4], a[(i + 1) % 4], color)
    quad(a[0], a[1], a[2], a[3], color)
    quad(b[0], b[1], b[2], b[3], color)
  }
  return { quad, tube, data: () => new Float32Array(out) }
}

/**
 * The 3D shape of a stair or ramp, in the path's local metres (x east, y north, z absolute metres).
 * Interleaved per vertex: position (3), normal (3), colour (3).
 * Stairs: treads and risers; flat landings outside the flight; open = a smooth sloped slab 0.2 m under
 * the slope line (one riser lower), solid = sides down 0.4 m into the ground. Railings on the chosen
 * sides: posts every ~1.2 m, top rail 0.95 m and mid rail 0.45 m above the slope line.
 */
export function buildStructureMesh(input: MeshInput): Float32Array {
  const { path, startH, endH, width, underneath, railings, look, materials } = input
  const length = path.length
  const writer = meshWriter()
  if (!(length > 1e-6) || !(width > 0)) return writer.data()
  const color = (id: string): V3 => rgb(materials[id]?.color ?? '#999999')
  const tread = color(look.tread)
  const riserColor: V3 = tread.map((c) => c * 0.85) as V3
  const side = color(look.side)
  const under = color(look.under)
  const rail = color(look.railing)
  const rise = endH - startH
  const half = width / 2

  const stairs = input.form === 'stairs'
  const shape = stairs ? stairShape(rise, length, input.flight) : null
  const steps = shape?.steps ?? 0
  const fs = shape && steps > 0 ? shape.flightStartM : 0
  const fe = shape && steps > 0 ? shape.flightEndM : length
  const tr = shape?.treadM ?? 0
  const riser = shape?.riserM ?? 0

  /** The slope line: flat landings, linear over the flight (ramps: linear over the whole run). */
  const line = (s: number) => (s <= fs ? startH : s >= fe ? endH : startH + (rise * (s - fs)) / (fe - fs || 1))
  /** Step tops for stairs; the slope line for ramps. */
  const top = (s: number) => {
    if (!stairs || steps === 0) return line(s)
    if (s <= fs + 1e-9) return startH
    if (s >= fe - 1e-9) return endH
    return startH + riser * Math.min(steps, Math.floor((s - fs) / tr) + 1)
  }
  const bottom = (xy: [number, number], s: number) => (underneath === 'solid' ? input.groundAt(xy[0], xy[1]) - SOLID_DEPTH : line(s) - Math.abs(riser) - UNDERSIDE_THICKNESS)
  const edge = (s: number, offset: number): [number, number] => {
    const { p, n } = path.at(s)
    return [p.x + n.x * offset, p.y + n.y * offset]
  }
  const P = (xy: [number, number], z: number): V3 => [xy[0], xy[1], z]

  // Breakpoints: every 0.25 m for curves, plus every tread edge so risers line up.
  const marks = new Set<number>([0, length])
  for (let s = 0.25; s < length; s += 0.25) marks.add(Math.round(s * 1e6) / 1e6)
  if (stairs && steps > 0) for (let k = 0; k <= steps; k++) marks.add(Math.round((fs + k * tr) * 1e6) / 1e6)
  const S = [...marks].filter((s) => s >= 0 && s <= length).sort((a, b) => a - b)

  for (let i = 1; i < S.length; i++) {
    const s0 = S[i - 1]
    const s1 = S[i]
    if (s1 - s0 < 1e-9) continue
    const mid = (s0 + s1) / 2
    const t0 = stairs ? top(mid) : top(s0)
    const t1 = stairs ? top(mid) : top(s1)
    const L0 = edge(s0, half)
    const L1 = edge(s1, half)
    const R0 = edge(s0, -half)
    const R1 = edge(s1, -half)
    writer.quad(P(L0, t0), P(L1, t1), P(R1, t1), P(R0, t0), tread)
    if (underneath === 'open') writer.quad(P(L0, bottom(L0, s0)), P(L1, bottom(L1, s1)), P(R1, bottom(R1, s1)), P(R0, bottom(R0, s0)), under)
    for (const [e0, e1] of [[L0, L1], [R0, R1]] as const) writer.quad(P(e0, t0), P(e1, t1), P(e1, bottom(e1, s1)), P(e0, bottom(e0, s0)), side)
  }

  if (stairs && steps > 0) {
    for (let k = 0; k <= steps; k++) {
      const s = fs + k * tr
      const from = startH + riser * k
      const to = k === steps ? endH : startH + riser * (k + 1)
      if (Math.abs(to - from) < 1e-9) continue
      const l = edge(s, half)
      const r = edge(s, -half)
      writer.quad(P(l, from), P(r, from), P(r, to), P(l, to), riserColor)
    }
  }

  const sides = railings === 'both' ? [1, -1] : railings === 'left' ? [1] : railings === 'right' ? [-1] : []
  const railSet = new Set<number>([0, length, fs, fe])
  for (let s = 1; s < length; s += 1) railSet.add(s)
  const railMarks = [...railSet].filter((s) => s >= 0 && s <= length).sort((a, b) => a - b)
  for (const sign of sides) {
    const offset = (half - RAIL_INSET) * sign
    const posts = Math.max(1, Math.round(length / 1.2))
    for (let k = 0; k <= posts; k++) {
      const s = Math.min(length, (k * length) / posts)
      const [x, y] = edge(s, offset)
      const z0 = top(Math.min(s, length - 1e-6))
      const z1 = line(s) + TOP_RAIL
      writer.tube([x - 0.03, y, (z0 + z1) / 2], [x + 0.03, y, (z0 + z1) / 2], 0.03, Math.max(0, (z1 - z0) / 2), rail)
    }
    // Rails bend only at the flight ends and along curves: a point every metre is enough.
    for (let i = 1; i < railMarks.length; i++) {
      const s0 = railMarks[i - 1]
      const s1 = railMarks[i]
      const a = edge(s0, offset)
      const b = edge(s1, offset)
      writer.tube(P(a, line(s0) + TOP_RAIL), P(b, line(s1) + TOP_RAIL), 0.035, 0.035, rail)
      writer.tube(P(a, line(s0) + MID_RAIL), P(b, line(s1) + MID_RAIL), 0.02, 0.02, rail)
    }
  }

  return writer.data()
}
