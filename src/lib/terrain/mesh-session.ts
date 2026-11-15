import { meshPointXY, nudgePoints, type TerrainGrid, type TerrainMesh } from '@navi/core'
import type { Command } from '@navi/editor'

/**
 * The Mesh tool's editing session (owner 2026-11-15): a draft of one mesh, what is selected, and how a click selects.
 * Pure state; the tool turns it into map layers and, on Confirm, one command.
 */
export type MeshSelectMode = 'point' | 'row' | 'col' | 'box'
type Cell = { row: number; col: number }

export interface MeshSession {
  original: TerrainMesh | null
  draft: TerrainMesh
  mode: MeshSelectMode
  selected: Cell[]
}

export function openSession(mesh: TerrainMesh, isNew: boolean): MeshSession {
  return { original: isNew ? null : structuredClone(mesh), draft: structuredClone(mesh), mode: 'point', selected: [] }
}

const key = (c: Cell) => `${c.row}:${c.col}`
function merge(current: Cell[], added: Cell[], additive: boolean): Cell[] {
  if (!additive) return added
  const seen = new Set(current.map(key))
  return [...current, ...added.filter((c) => !seen.has(key(c)))]
}
const rowCells = (m: TerrainMesh, row: number) => m.colsAt.map((_, col) => ({ row, col }))
const colCells = (m: TerrainMesh, col: number) => m.rowsAt.map((_, row) => ({ row, col }))

export function selectAt(s: MeshSession, hit: Cell, additive: boolean): MeshSession {
  const cells = s.mode === 'row' ? rowCells(s.draft, hit.row) : s.mode === 'col' ? colCells(s.draft, hit.col) : [hit]
  return { ...s, selected: merge(s.selected, cells, additive) }
}

export function selectLine(s: MeshSession, axis: 'row' | 'col', index: number, additive: boolean): MeshSession {
  return { ...s, selected: merge(s.selected, axis === 'row' ? rowCells(s.draft, index) : colCells(s.draft, index), additive) }
}

export function selectBox(s: MeshSession, rows: [number, number], cols: [number, number], additive: boolean): MeshSession {
  const cells: Cell[] = []
  for (let row = Math.min(...rows); row <= Math.max(...rows); row++) for (let col = Math.min(...cols); col <= Math.max(...cols); col++) cells.push({ row, col })
  return { ...s, selected: merge(s.selected, cells, additive) }
}

export function dragHeight(s: MeshSession, grid: TerrainGrid, deltaM: number): MeshSession {
  if (s.selected.length === 0 || !Number.isFinite(deltaM)) return s
  return { ...s, draft: nudgePoints(s.draft, grid, s.selected, deltaM, s.draft.softM) }
}

/** The resulting height at each point (row-major): its value in Smooth out, ground below + value in Keep bumps. */
export function pointHeights(mesh: TerrainMesh, grid: TerrainGrid, groundBelowAt: (x: number, y: number) => number): number[] {
  const cols = mesh.colsAt.length
  return mesh.z.map((value, i) => {
    if (mesh.mode === 'smooth') return value
    const p = meshPointXY(mesh, grid, Math.floor(i / cols), i % cols)
    return groundBelowAt(p.x, p.y) + value
  })
}

export function typeHeight(s: MeshSession, grid: TerrainGrid, groundBelowAt: (x: number, y: number) => number, heightM: number): MeshSession {
  if (s.selected.length === 0 || !Number.isFinite(heightM)) return s
  const cols = s.draft.colsAt.length
  const chosen = new Set(s.selected.map((c) => c.row * cols + c.col))
  const z = s.draft.z.map((value, i) => {
    if (!chosen.has(i)) return value
    if (s.draft.mode === 'smooth') return heightM
    const p = meshPointXY(s.draft, grid, Math.floor(i / cols), i % cols)
    return heightM - groundBelowAt(p.x, p.y)
  })
  return { ...s, draft: { ...s.draft, z } }
}

export function sessionCommand(s: MeshSession): Command | null {
  if (!s.original) return { id: 'terrain.mesh.add', label: 'Add mesh', payload: { mesh: s.draft } }
  if (JSON.stringify(s.original) === JSON.stringify(s.draft)) return null
  return { id: 'terrain.mesh.update', label: 'Edit mesh', payload: { mesh: s.draft } }
}
