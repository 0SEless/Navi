import { describe, expect, it } from 'vitest'
import { newMesh, toLatLng } from '@navi/core'
import { type MeshSession, dragHeight, openSession, pointHeights, selectAt, selectBox, selectLine, sessionCommand, typeHeight } from '../mesh-session'

const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const mesh = () => ({ ...newMesh('m', 'M', [ll(0, 0), ll(30, 0), ll(30, 30), ll(0, 30)], grid), softM: 0 })
const slope = (x: number) => 0.5 * x

describe('mesh session', () => {
  it('Row mode selects the whole row; Shift adds another row', () => {
    let s: MeshSession = { ...openSession(mesh(), true), mode: 'row' }
    s = selectAt(s, { row: 1, col: 2 }, false)
    expect(s.selected).toEqual([0, 1, 2, 3].map((col) => ({ row: 1, col })))
    s = selectAt(s, { row: 3, col: 0 }, true)
    expect(s.selected).toHaveLength(8)
  })

  it('Column mode, line selection and box selection', () => {
    let s: MeshSession = { ...openSession(mesh(), true), mode: 'col' }
    s = selectAt(s, { row: 0, col: 1 }, false)
    expect(s.selected.every((p) => p.col === 1)).toBe(true)
    expect(selectLine(s, 'row', 2, false).selected.every((p) => p.row === 2)).toBe(true)
    expect(selectBox(s, [1, 2], [1, 2], false).selected).toHaveLength(4)
  })

  it('dragging moves only the selection when Soft is off', () => {
    let s = selectAt(openSession(mesh(), true), { row: 1, col: 1 }, false)
    s = dragHeight(s, grid, 2)
    expect(s.draft.z.filter((v) => v !== 0)).toEqual([2])
  })

  it('a typed height becomes the point\'s actual height, in both modes', () => {
    let s = selectAt(openSession(mesh(), true), { row: 2, col: 2 }, false)
    s = typeHeight(s, grid, (x) => slope(x), 7)
    expect(pointHeights(s.draft, grid, (x) => slope(x))[2 * 4 + 2]).toBeCloseTo(7, 9)
    const smooth = { ...s, draft: { ...s.draft, mode: 'smooth' as const, z: s.draft.z.map(() => 1) } }
    const typed = typeHeight(smooth, grid, (x) => slope(x), 4)
    expect(pointHeights(typed.draft, grid, (x) => slope(x))[2 * 4 + 2]).toBeCloseTo(4, 9)
  })

  it('Confirm adds a new mesh, updates an edited one, and does nothing when unchanged', () => {
    const fresh = openSession(mesh(), true)
    expect(sessionCommand(fresh)?.id).toBe('terrain.mesh.add')
    const saved = openSession(mesh(), false)
    expect(sessionCommand(saved)).toBeNull()
    expect(sessionCommand(dragHeight(selectAt(saved, { row: 0, col: 0 }, false), grid, 1))?.id).toBe('terrain.mesh.update')
  })
})
