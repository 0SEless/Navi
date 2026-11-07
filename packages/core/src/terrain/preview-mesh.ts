import { parseTileId, TILE_CELLS } from './grid'
import type { TileId } from './types'

/**
 * Mesh data for the terrain paint preview: one Float32Array of 9 floats per vertex, the exact
 * `MeshLayer.setMesh` format — position in local metres east/north of the terrain grid origin and
 * absolute metres up, a normal for shading, and a constant colour. Positions come from the same
 * sampler the committed terrain uses, so preview and DEM agree by construction.
 */

export interface TerrainPreviewPatch {
  id: TileId
  /** Inclusive sample bounds in grid coordinates (1 m anchors). */
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface TerrainPreviewMeshOptions {
  /** Height in metres at a 1 m grid anchor (the stroke sampler or the document sampler). */
  heightAt: (x: number, y: number) => number
  /** Vertex colour, 0..1 (a flat, neutral tone; the shader adds slope shading). */
  color: readonly [number, number, number]
  /** Cells to leave out (the cell whose south-west corner is x, y): ones this stroke did not change. */
  skipCell?: (x: number, y: number) => boolean
}

/** The normal from ±1 m central differences; a height sample that is not finite reads as flat. */
function normalAt(heightAt: (x: number, y: number) => number, x: number, y: number): [number, number, number] {
  const dx = (heightAt(x + 1, y) - heightAt(x - 1, y)) / 2
  const dy = (heightAt(x, y + 1) - heightAt(x, y - 1)) / 2
  const nx = Number.isFinite(dx) && dx !== 0 ? -dx : 0
  const ny = Number.isFinite(dy) && dy !== 0 ? -dy : 0
  const len = Math.hypot(nx, ny, 1)
  return [nx / len, ny / len, 1 / len]
}

/** One triangle A B C: three vertices × (position, normal, colour). */
function vertices(
  mesh: number[],
  out: TerrainPreviewMeshOptions,
  p: Array<{ x: number; y: number }>,
): void {
  for (const { x, y } of p) {
    const z = out.heightAt(x, y)
    const [nx, ny, nz] = normalAt(out.heightAt, x, y)
    mesh.push(
      x, Number.isFinite(y) ? y : 0, Number.isFinite(z) ? z : 0,
      nx, ny, nz, out.color[0], out.color[1], out.color[2],
    )
  }
}

/** Two CCW triangles per 1 m cell, viewed from above; each vertex gets its own shaded normal. */
export function terrainPreviewMesh(patches: TerrainPreviewPatch[], opts: TerrainPreviewMeshOptions): Float32Array {
  const mesh: number[] = []
  for (const patch of patches) {
    for (let y = patch.y0; y <= patch.y1; y++) {
      for (let x = patch.x0; x <= patch.x1; x++) {
        if (opts.skipCell?.(x, y)) continue
        vertices(mesh, opts, [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }])
        vertices(mesh, opts, [{ x: x + 1, y }, { x: x + 1, y: y + 1 }, { x, y: y + 1 }])
      }
    }
  }
  return new Float32Array(mesh)
}

/** The patch of one tile: the bounding box of its non-zero cells, or null when the tile is flat. */
export function terrainPreviewPatch(id: TileId, cells: Int16Array): TerrainPreviewPatch | null {
  const { col, row } = parseTileId(id)
  let lx0 = TILE_CELLS
  let ly0 = TILE_CELLS
  let lx1 = -1
  let ly1 = -1
  for (let ly = 0; ly < TILE_CELLS; ly++) {
    for (let lx = 0; lx < TILE_CELLS; lx++) {
      if (cells[ly * TILE_CELLS + lx] === 0) continue
      lx0 = Math.min(lx0, lx)
      ly0 = Math.min(ly0, ly)
      lx1 = Math.max(lx1, lx)
      ly1 = Math.max(ly1, ly)
    }
  }
  if (lx1 < 0) return null
  return { id, x0: col * TILE_CELLS + lx0, y0: row * TILE_CELLS + ly0, x1: col * TILE_CELLS + lx1, y1: row * TILE_CELLS + ly1 }
}

/** One patch per non-flat working tile of the stroke. */
export function terrainPreviewPatches(tiles: Map<TileId, Int16Array>): TerrainPreviewPatch[] {
  const patches: TerrainPreviewPatch[] = []
  for (const [id, cells] of tiles) {
    const patch = terrainPreviewPatch(id, cells)
    if (patch) patches.push(patch)
  }
  return patches
}

