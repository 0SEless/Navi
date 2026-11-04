import { describe, expect, it } from 'vitest'
import { TILE_CELLS } from '../grid'
import type { TileId } from '../types'
import { terrainPreviewMesh, terrainPreviewPatch, terrainPreviewPatches } from '../preview-mesh'

const C = [0.6, 0.64, 0.58] as const
const flat = () => 0
const two = (id: string, x0: number, y0: number, x1: number, y1: number) => ({
  id: id as TileId, x0, y0, x1, y1,
})

describe('terrainPreviewMesh', () => {
  it('emits two CCW triangles per cell: a 2x2-cell patch is 8 triangles, 24 vertices', () => {
    const mesh = terrainPreviewMesh([two('0_0', 0, 0, 1, 1)], { heightAt: flat, color: C })
    expect(mesh.length / 9).toBe(24)
  })

  it('writes the first cell as [A(x,y) B(x+1,y) D(x,y+1)] then [B C(x+1,y+1) D], positions in local metres', () => {
    const mesh = terrainPreviewMesh([two('0_0', 0, 0, 1, 1)], { heightAt: flat, color: C })
    const at = (i: number) => [...mesh.slice(i * 9, i * 9 + 9)]
    expect(at(0).slice(0, 3)).toEqual([0, 0, 0])
    expect(at(1).slice(0, 3)).toEqual([1, 0, 0])
    expect(at(2).slice(0, 3)).toEqual([0, 1, 0])
    expect(at(3).slice(0, 3)).toEqual([1, 0, 0])
    expect(at(4).slice(0, 3)).toEqual([1, 1, 0])
    expect(at(5).slice(0, 3)).toEqual([0, 1, 0])
  })

  it('heights come from heightAt at cell anchors, in metres', () => {
    const h = (x: number, y: number) => (x * 10 + y) / 100
    const mesh = terrainPreviewMesh([two('0_0', 0, 0, 0, 0)], { heightAt: h, color: C })
    const at = (i: number) => [...mesh.slice(i * 9, i * 9 + 9)]
    expect(at(0)[0]).toBe(0); expect(at(0)[1]).toBe(0); expect(at(0)[2]).toBe(0)
    expect(at(1)[0]).toBe(1); expect(at(1)[1]).toBe(0); expect(at(1)[2]).toBeCloseTo(0.1, 5)
    expect(at(2)[0]).toBe(0); expect(at(2)[1]).toBe(1); expect(at(2)[2]).toBeCloseTo(0.01, 5)
  })

  it('normals are unit central-difference gradients: flat ground is (0,0,1)', () => {
    const mesh = terrainPreviewMesh([two('0_0', 0, 0, 0, 0)], { heightAt: flat, color: C })
    const at = (i: number) => [...mesh.slice(i * 9 + 3, i * 9 + 6)]
    expect(at(0)).toEqual([0, 0, 1])
    expect(at(2)).toEqual([0, 0, 1])
  })

  it('normals tilt against the slope: h = x with ±1 m sampling gives n = (-1, 0, 1) / √2', () => {
    const mesh = terrainPreviewMesh([two('0_0', 0, 0, 0, 0)], { heightAt: (x) => x, color: C })
    const len = Math.SQRT2
    expect(mesh[3]).toBeCloseTo(-1 / len, 5)
    expect(mesh[4]).toBeCloseTo(0, 5)
    expect(mesh[5]).toBeCloseTo(1 / len, 5)
  })

  it('paints every vertex with the given colour (Float32 precision)', () => {
    const mesh = terrainPreviewMesh([two('0_0', 0, 0, 1, 1)], { heightAt: flat, color: C })
    for (let i = 0; i < 24; i++) {
      expect(mesh[i * 9 + 6]).toBeCloseTo(0.6, 5)
      expect(mesh[i * 9 + 7]).toBeCloseTo(0.64, 5)
      expect(mesh[i * 9 + 8]).toBeCloseTo(0.58, 5)
    }
  })

  it('concatenates patches: the second patch starts right after the first', () => {
    const first = terrainPreviewMesh([two('0_0', 0, 0, 0, 0)], { heightAt: flat, color: C })
    const both = terrainPreviewMesh([two('0_0', 0, 0, 0, 0), two('0_0', 4, 4, 4, 4)], { heightAt: flat, color: C })
    expect(both.length).toBe(first.length * 2)
    expect([...both.slice(first.length, first.length + 3)]).toEqual([4, 4, 0])
  })

  it('returns nothing without patches', () => {
    expect([...terrainPreviewMesh([], { heightAt: flat, color: C })]).toEqual([])
  })

  it('paints the full inclusive bbox of a real patch: one dabbed cell is 2 triangles, a one-row stroke is not empty', () => {
    const one = new Int16Array(TILE_CELLS * TILE_CELLS)
    one[0] = 120
    const single = terrainPreviewPatch('0_0', one)
    expect(terrainPreviewMesh([single!], { heightAt: flat, color: C }).length / 9).toBe(6)

    const row = new Int16Array(TILE_CELLS * TILE_CELLS)
    row[0] = 100
    row[1] = 120
    const painted = terrainPreviewPatch('0_0', row)
    expect(terrainPreviewMesh([painted!], { heightAt: flat, color: C }).length / 9).toBe(12)
  })

  it('finite heights only: NaN from the sampler does not poison the mesh', () => {
    const mesh = terrainPreviewMesh([two('0_0', 0, 0, 0, 0)], { heightAt: () => Number.NaN, color: C })
    for (const value of mesh) expect(Number.isFinite(value)).toBe(true)
  })
})

describe('terrainPreviewPatch', () => {
  const tile = () => new Int16Array(TILE_CELLS * TILE_CELLS)

  it('wraps the non-zero cells of a tile as a patch in grid sample coordinates', () => {
    const cells = tile()
    cells[5 * TILE_CELLS + 7] = 250
    cells[9 * TILE_CELLS + 3] = -120
    expect(terrainPreviewPatch('0_0', cells)).toEqual({ id: '0_0', x0: 3, y0: 5, x1: 7, y1: 9 })
  })

  it('is placed by the tile id: tile -1_2 adds its col/row offset', () => {
    const cells = tile()
    cells[3 * TILE_CELLS + 2] = 25
    expect(terrainPreviewPatch('-1_2', cells)).toEqual({ id: '-1_2', x0: -126, y0: 259, x1: -126, y1: 259 })
  })

  it('a flat tile has no patch', () => {
    expect(terrainPreviewPatch('0_0', tile())).toBeNull()
  })

  it('lists one patch per non-flat tile of the stroke, skipping flat tiles', () => {
    const a = tile()
    a[0] = 10
    const zero = tile()
    const patches = terrainPreviewPatches(new Map([['0_0', a], ['0_1', zero]]) as Map<TileId, Int16Array>)
    expect(patches).toEqual([{ id: '0_0', x0: 0, y0: 0, x1: 0, y1: 0 }])
  })
})
