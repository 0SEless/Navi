import { toLocal } from './grid'
import type { TerrainGrid } from './types'

/**
 * Terrain mesh (owner 2026-11-15): a grid of lines laid over a lassoed area. The grid is a rectangle in its own frame
 * (u along the outline's longest edge, v across it), so lines can slide but never cross. `z` is either metres added
 * to the ground below (`keep-bumps`) or absolute heights (`smooth`). Nothing outside `outline` is ever changed.
 */
type LatLng = { lat: number; lng: number }
type Point = { x: number; y: number }
type Box = { minX: number; minY: number; maxX: number; maxY: number }

export interface TerrainMesh {
  id: string
  name: string
  outline: LatLng[]
  origin: Point
  angleRad: number
  rowsAt: number[]
  colsAt: number[]
  mode: 'keep-bumps' | 'smooth'
  z: number[]
  edgeWidthM: number
  softM: number
  hidden?: boolean
}

export interface MeshFrame {
  outline: Point[]
  box: Box
  toUV(p: Point): { u: number; v: number }
  toXY(u: number, v: number): Point
}

const MIN_GAP_M = 0.5

const increasing = (values: unknown): values is number[] =>
  Array.isArray(values) && values.length >= 2 && values.every((v, i) => typeof v === 'number' && Number.isFinite(v) && (i === 0 || v > (values[i - 1] as number)))

export function isValidMesh(mesh: unknown): mesh is TerrainMesh {
  if (typeof mesh !== 'object' || mesh === null) return false
  const m = mesh as Partial<TerrainMesh>
  return typeof m.id === 'string' && m.id !== ''
    && Array.isArray(m.outline) && m.outline.length >= 3 && m.outline.every((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
    && Number.isFinite(m.origin?.x) && Number.isFinite(m.origin?.y) && Number.isFinite(m.angleRad)
    && increasing(m.rowsAt) && increasing(m.colsAt)
    && (m.mode === 'keep-bumps' || m.mode === 'smooth')
    && Array.isArray(m.z) && m.z.length === m.rowsAt.length * m.colsAt.length && m.z.every((v) => Number.isFinite(v))
    && Number.isFinite(m.edgeWidthM) && (m.edgeWidthM as number) >= 0
    && Number.isFinite(m.softM) && (m.softM as number) >= 0
}

function frameOf(origin: Point, angle: number) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return {
    toUV: (p: Point) => {
      const dx = p.x - origin.x
      const dy = p.y - origin.y
      return { u: dx * c + dy * s, v: -dx * s + dy * c }
    },
    toXY: (u: number, v: number): Point => ({ x: origin.x + u * c - v * s, y: origin.y + u * s + v * c }),
  }
}

export function meshFrame(mesh: TerrainMesh, grid: TerrainGrid): MeshFrame {
  const outline = mesh.outline.map((p) => toLocal(grid, p))
  const box = {
    minX: Math.min(...outline.map((p) => p.x)), minY: Math.min(...outline.map((p) => p.y)),
    maxX: Math.max(...outline.map((p) => p.x)), maxY: Math.max(...outline.map((p) => p.y)),
  }
  return { outline, box, ...frameOf(mesh.origin, mesh.angleRad) }
}

const spread = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1))

export function newMesh(id: string, name: string, outline: LatLng[], grid: TerrainGrid): TerrainMesh {
  const local = outline.map((p) => toLocal(grid, p))
  let angle = 0
  let longest = -1
  for (let i = 0; i < local.length; i++) {
    const a = local[i]
    const b = local[(i + 1) % local.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > longest) {
      longest = len
      angle = Math.atan2(b.y - a.y, b.x - a.x)
    }
  }
  const f = frameOf({ x: 0, y: 0 }, angle)
  const uv = local.map((p) => f.toUV(p))
  const minU = Math.min(...uv.map((p) => p.u))
  const minV = Math.min(...uv.map((p) => p.v))
  const width = Math.max(1, Math.max(...uv.map((p) => p.u)) - minU)
  const depth = Math.max(1, Math.max(...uv.map((p) => p.v)) - minV)
  return {
    id, name, outline: outline.map((p) => ({ lat: p.lat, lng: p.lng })),
    origin: f.toXY(minU, minV), angleRad: angle,
    rowsAt: spread(0, depth, 4), colsAt: spread(0, width, 4),
    mode: 'keep-bumps', z: new Array(16).fill(0), edgeWidthM: 3, softM: 6,
  }
}

/** Monotone-free cubic Hermite through (xs, ys) with metre-aware tangents; flat beyond the ends. */
function curve(xs: number[], ys: number[], x: number): number {
  const n = xs.length
  if (x <= xs[0]) return ys[0]
  if (x >= xs[n - 1]) return ys[n - 1]
  let i = 0
  while (i < n - 2 && x > xs[i + 1]) i++
  const slope = (k: number) => {
    if (k === 0) return (ys[1] - ys[0]) / (xs[1] - xs[0])
    if (k === n - 1) return (ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2])
    return (ys[k + 1] - ys[k - 1]) / (xs[k + 1] - xs[k - 1])
  }
  const h = xs[i + 1] - xs[i]
  const t = (x - xs[i]) / h
  const t2 = t * t
  const t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * slope(i) + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * slope(i + 1)
}

export function meshValueAt(mesh: TerrainMesh, u: number, v: number): number {
  const cols = mesh.colsAt.length
  const along = mesh.rowsAt.map((_, r) => curve(mesh.colsAt, mesh.z.slice(r * cols, r * cols + cols), u))
  return curve(mesh.rowsAt, along, v)
}

function pointInPolygon(p: Point, ring: Point[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function distanceToRing(p: Point, ring: Point[]): number {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
  }
  return best
}

const smoothstep = (t: number) => {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

export function meshWeightAt(frame: MeshFrame, mesh: TerrainMesh, p: Point): number {
  if (p.x < frame.box.minX || p.x > frame.box.maxX || p.y < frame.box.minY || p.y > frame.box.maxY) return 0
  if (!pointInPolygon(p, frame.outline)) return 0
  if (!(mesh.edgeWidthM > 0)) return 1
  return smoothstep(distanceToRing(p, frame.outline) / mesh.edgeWidthM)
}

export function meshPointXY(mesh: TerrainMesh, _grid: TerrainGrid, row: number, col: number): Point {
  return frameOf(mesh.origin, mesh.angleRad).toXY(mesh.colsAt[col], mesh.rowsAt[row])
}

export function setMeshMode(mesh: TerrainMesh, mode: TerrainMesh['mode'], groundBelowAt: (x: number, y: number) => number, grid: TerrainGrid): TerrainMesh {
  if (mesh.mode === mode) return mesh
  const cols = mesh.colsAt.length
  const z = mesh.z.map((value, i) => {
    const p = meshPointXY(mesh, grid, Math.floor(i / cols), i % cols)
    const ground = groundBelowAt(p.x, p.y)
    return mode === 'smooth' ? ground + value : value - ground
  })
  return { ...mesh, mode, z }
}

export function slideLine(mesh: TerrainMesh, axis: 'row' | 'col', index: number, toMetres: number): TerrainMesh {
  const lines = [...(axis === 'row' ? mesh.rowsAt : mesh.colsAt)]
  const low = index > 0 ? lines[index - 1] + MIN_GAP_M : -Infinity
  const high = index < lines.length - 1 ? lines[index + 1] - MIN_GAP_M : Infinity
  lines[index] = Math.min(high, Math.max(low, toMetres))
  return axis === 'row' ? { ...mesh, rowsAt: lines } : { ...mesh, colsAt: lines }
}

export function insertLine(mesh: TerrainMesh, axis: 'row' | 'col', atMetres: number): TerrainMesh {
  const lines = axis === 'row' ? mesh.rowsAt : mesh.colsAt
  if (lines.some((l) => Math.abs(l - atMetres) < MIN_GAP_M)) return mesh
  const at = lines.findIndex((l) => l > atMetres)
  const index = at < 0 ? lines.length : at
  const nextLines = [...lines.slice(0, index), atMetres, ...lines.slice(index)]
  const rows = mesh.rowsAt.length
  const cols = mesh.colsAt.length
  if (axis === 'row') {
    const added = mesh.colsAt.map((u) => meshValueAt(mesh, u, atMetres))
    return { ...mesh, rowsAt: nextLines, z: [...mesh.z.slice(0, index * cols), ...added, ...mesh.z.slice(index * cols)] }
  }
  const z: number[] = []
  for (let r = 0; r < rows; r++) {
    const row = mesh.z.slice(r * cols, r * cols + cols)
    row.splice(index, 0, meshValueAt(mesh, atMetres, mesh.rowsAt[r]))
    z.push(...row)
  }
  return { ...mesh, colsAt: nextLines, z }
}

export function nudgePoints(mesh: TerrainMesh, _grid: TerrainGrid, selected: ReadonlyArray<{ row: number; col: number }>, deltaM: number, softM: number): TerrainMesh {
  const cols = mesh.colsAt.length
  const chosen = new Set(selected.map((p) => p.row * cols + p.col))
  const z = mesh.z.map((value, i) => {
    if (chosen.has(i)) return value + deltaM
    if (!(softM > 0) || chosen.size === 0) return value
    const u = mesh.colsAt[i % cols]
    const v = mesh.rowsAt[Math.floor(i / cols)]
    let nearest = Infinity
    for (const p of selected) nearest = Math.min(nearest, Math.hypot(u - mesh.colsAt[p.col], v - mesh.rowsAt[p.row]))
    return nearest < softM ? value + deltaM * (1 - smoothstep(nearest / softM)) : value
  })
  return { ...mesh, z }
}

export function levelMesh(mesh: TerrainMesh, heightM: number, _groundBelowAt: (x: number, y: number) => number, _grid: TerrainGrid): TerrainMesh {
  return { ...mesh, mode: 'smooth', z: mesh.z.map(() => heightM) }
}
