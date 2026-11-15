import { describe, expect, it } from 'vitest'
import { toLatLng } from '../grid'
import {
  insertLine, isValidMesh, levelMesh, meshFrame, meshPointXY, meshValueAt, meshWeightAt, newMesh, nudgePoints, setMeshMode, slideLine,
  type TerrainMesh,
} from '../mesh'

const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const square = [ll(0, 0), ll(30, 0), ll(30, 30), ll(0, 30)]

function base(over: Partial<TerrainMesh> = {}): TerrainMesh {
  return {
    id: 'm', name: 'M', outline: square, origin: { x: 0, y: 0 }, angleRad: 0,
    rowsAt: [0, 10, 20, 30], colsAt: [0, 10, 20, 30], mode: 'keep-bumps', z: new Array(16).fill(0),
    edgeWidthM: 3, softM: 6, ...over,
  }
}

describe('newMesh', () => {
  it('fills the outline with 4 × 4 lines at zero, a valid mesh', () => {
    const m = newMesh('a', 'A', square, grid)
    expect(m.rowsAt).toHaveLength(4)
    expect(m.colsAt).toHaveLength(4)
    expect(m.z.every((v) => v === 0)).toBe(true)
    expect(m.mode).toBe('keep-bumps')
    expect(isValidMesh(m)).toBe(true)
  })

  it('lines the grid up with the outline\'s longest edge', () => {
    const a = Math.PI / 6
    const rot = (x: number, y: number) => ll(x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a))
    const m = newMesh('r', 'R', [rot(0, 0), rot(60, 0), rot(60, 20), rot(0, 20)], grid)
    const diff = Math.abs(((m.angleRad - a) % Math.PI + Math.PI) % Math.PI)
    expect(Math.min(diff, Math.PI - diff)).toBeLessThan(1e-3)
  })
})

describe('isValidMesh', () => {
  it('refuses bad stored meshes', () => {
    expect(isValidMesh(base({ outline: square.slice(0, 2) }))).toBe(false)
    expect(isValidMesh(base({ rowsAt: [0, 0, 20, 30] }))).toBe(false)
    expect(isValidMesh(base({ z: new Array(15).fill(0) }))).toBe(false)
    expect(isValidMesh(base({ z: [NaN, ...new Array(15).fill(0)] }))).toBe(false)
    expect(isValidMesh(null)).toBe(false)
  })
})

describe('meshValueAt', () => {
  const z = Array.from({ length: 16 }, (_, i) => (i % 4) * 2 + Math.floor(i / 4))
  const m = base({ z })
  it('passes exactly through every point', () => {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) expect(meshValueAt(m, c * 10, r * 10)).toBeCloseTo(z[r * 4 + c], 9)
  })
  it('equals two equal neighbours between them, and continues the outer line beyond it', () => {
    const flat = base({ z: new Array(16).fill(5) })
    expect(meshValueAt(flat, 15, 15)).toBeCloseTo(5, 9)
    expect(meshValueAt(m, 45, 0)).toBeCloseTo(meshValueAt(m, 30, 0), 9)
    expect(meshValueAt(m, -10, 20)).toBeCloseTo(meshValueAt(m, 0, 20), 9)
  })
})

describe('meshWeightAt', () => {
  it('is 0 outside, 1 at the edge width inside, between halfway; 1 everywhere inside without an edge', () => {
    const m = base()
    const f = meshFrame(m, grid)
    expect(meshWeightAt(f, m, { x: -0.5, y: 15 })).toBe(0)
    expect(meshWeightAt(f, m, { x: 3, y: 15 })).toBeCloseTo(1, 9)
    const half = meshWeightAt(f, m, { x: 1.5, y: 15 })
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(1)
    const sharp = base({ edgeWidthM: 0 })
    expect(meshWeightAt(meshFrame(sharp, grid), sharp, { x: 0.1, y: 15 })).toBe(1)
  })
})

describe('setMeshMode', () => {
  it('keeps every point where it is when switching modes, both ways', () => {
    const g = (x: number) => 0.5 * x
    const m = base({ z: Array.from({ length: 16 }, (_, i) => i * 0.1) })
    const smooth = setMeshMode(m, 'smooth', (x) => g(x), grid)
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const p = meshPointXY(m, grid, r, c)
      expect(smooth.z[r * 4 + c]).toBeCloseTo(g(p.x) + m.z[r * 4 + c], 6)
    }
    const back = setMeshMode(smooth, 'keep-bumps', (x) => g(x), grid)
    back.z.forEach((v, i) => expect(v).toBeCloseTo(m.z[i], 6))
  })
})

describe('slideLine', () => {
  it('moves one line but never past its neighbours', () => {
    expect(slideLine(base(), 'row', 1, 25).rowsAt).toEqual([0, 19.5, 20, 30])
    expect(slideLine(base(), 'row', 1, -5).rowsAt).toEqual([0, 0.5, 20, 30])
    const r = slideLine(base(), 'col', 3, 100).colsAt
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThan(r[i - 1])
  })
})

describe('insertLine', () => {
  it('adds a line without changing the surface', () => {
    const z = Array.from({ length: 16 }, (_, i) => (i % 4) * 0.3 + Math.floor(i / 4) * 0.7)
    const m = base({ z })
    const n = insertLine(m, 'row', 15)
    expect(n.rowsAt).toHaveLength(5)
    expect(n.z).toHaveLength(20)
    for (const [u, v] of [[5, 5], [15, 15], [25, 12], [2, 28], [18, 16]]) expect(meshValueAt(n, u, v)).toBeCloseTo(meshValueAt(m, u, v), 1)
    expect(insertLine(m, 'row', 10.2)).toBe(m)
  })
})

describe('nudgePoints', () => {
  it('moves only the selection without Soft; neighbours follow partly with Soft; far points stay', () => {
    const one = nudgePoints(base(), grid, [{ row: 1, col: 1 }], 2, 0)
    expect(one.z.filter((v) => v !== 0)).toEqual([2])
    const soft = nudgePoints(base(), grid, [{ row: 1, col: 1 }], 2, 15)
    expect(soft.z[1 * 4 + 1]).toBe(2)
    const neighbour = soft.z[1 * 4 + 2]
    expect(neighbour).toBeGreaterThan(0)
    expect(neighbour).toBeLessThan(2)
    expect(soft.z[3 * 4 + 3]).toBe(0)
  })
})

describe('levelMesh', () => {
  it('turns the mesh into a flat platform', () => {
    const m = levelMesh(base(), 4.5, () => 1, grid)
    expect(m.mode).toBe('smooth')
    expect(m.z.every((v) => v === 4.5)).toBe(true)
  })
})
