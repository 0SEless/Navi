import { describe, expect, it } from 'vitest'
import { newMesh, toLatLng } from '@navi/core'
import { meshLineSlice, roadSlice } from '../profile-slice'

const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })

describe('profile slices', () => {
  it('a mesh row: one handle per column at its distance, before and after sampled every metre', () => {
    const mesh = newMesh('m', 'M', [ll(0, 0), ll(30, 0), ll(30, 30), ll(0, 30)], grid)
    const slice = meshLineSlice(mesh, 'row', 1, grid, (x) => x * 0.1, (x) => x * 0.1 + 1)
    expect(slice.handles.map((h) => Math.round(h.s))).toEqual([0, 10, 20, 30])
    expect(slice.handles[2].h).toBeCloseTo(3, 6)
    expect(slice.lengthM).toBeCloseTo(30, 6)
    expect(slice.before).toHaveLength(31)
    expect(slice.after[10].h - slice.before[10].h).toBeCloseTo(1, 6)
  })

  it('a road: pins become handles', () => {
    const slice = roadSlice([{ x: 0, y: 0 }, { x: 20, y: 0 }], [{ alongM: 5, heightM: 2 }], () => 0, () => 0.5)
    expect(slice.handles).toEqual([{ key: 'pin:0', s: 5, h: 2 }])
    expect(slice.before).toHaveLength(21)
  })
})
