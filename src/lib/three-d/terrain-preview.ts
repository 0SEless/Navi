import type maplibregl from 'maplibre-gl'
import {
  createTerrainSampler,
  terrainPreviewMesh,
  terrainPreviewPatches,
  type CampusDocument,
  type HeightField,
  type Rect,
  type TerrainSampler,
  type TileId,
} from '@navi/core'
import { overlayAnchor } from '@/lib/terrain/terrain-view'
import { createMeshLayer, type MeshLayer } from './mesh-layer'
import { whenStyleReady } from '@/lib/terrain/style-ready'
import { currentHeightField } from '@/lib/terrain/use-terrain-sampler'

/** With the height field, the preview is split into 32 × 32 m chunks; a frame rebuilds only those its rectangle touched. */
const CHUNK_M = 32
const SAME_M = 0.005

export const PREVIEW_LAYER_ID = 'terrain-preview'

/** Neutral wet-clay tone for the stroke patch; the committed ground look stays section 2. */
const PREVIEW_COLOR: readonly [number, number, number] = [0.56, 0.62, 0.58]
const EMPTY_MESH = new Float32Array(0)

/**
 * The clay preview while painting: a MeshLayer per map draws the stroke's working tiles, built from
 * the same sampler family the committed terrain uses (the tiles override is read through, so dabs
 * appear within a frame). No DEM reload, version bump or sampler rebuild happens for paint feedback.
 * commit() clears the preview only when the real tiles have landed: each map's next idle event.
 */
export class TerrainPaintPreview {
  private layers = new Map<maplibregl.Map, MeshLayer>()
  private registered: Array<maplibregl.Map> = []
  private origin: { lat: number; lng: number } | null = null
  private tiles: Map<TileId, Int16Array> | null = null
  private sampler: TerrainSampler | null = null
  /** The ground before this stroke: cells it did not change are not drawn (they would flicker on the ground). */
  private committed: TerrainSampler | null = null
  private exaggeration = 1
  private pending: Array<{ map: maplibregl.Map; listener: () => void }> = []
  // Height-field mode: the field is updated in place with the stroke's working tiles, the preview drawn in chunks.
  private document: CampusDocument | null = null
  private field: HeightField | null = null
  /** The field's heights at the stroke start: cells still equal to it are not drawn. */
  private baseline: Float32Array | null = null
  private chunks = new Map<string, Float32Array>()
  /** Everything this stroke rewrote in the field (cancel puts the committed ground back there). */
  private strokeRect: Rect | null = null
  private mesh: Float32Array = EMPTY_MESH

  /** The route's current maps and the view's exaggeration; called on every render. */
  setMaps(maps: maplibregl.Map[], exaggeration: number): void {
    this.exaggeration = Math.min(5, Math.max(1, exaggeration))
    this.registered = [...maps]
    for (const [map, layer] of [...this.layers]) if (!maps.includes(map)) this.layers.delete(map)
    for (const map of this.registered) this.ensureLayer(map)
    for (const [map, layer] of this.layers) layer.setVerticalScale(this.scaleOf(map))
  }

  /**
   * A stroke began: remember its working tiles (read live). With the editor's height field, frames update the field
   * and redraw touched chunks; without it, a sampler over the working tiles redraws the whole patch (fallback).
   */
  start(document: CampusDocument, tiles: Map<TileId, Int16Array>, field: HeightField | null = currentHeightField()): void {
    this.cancelCommits()
    this.tiles = tiles
    this.origin = document.terrain ? { lat: document.terrain.grid.originLat, lng: document.terrain.grid.originLng } : null
    this.document = document
    this.field = this.origin ? field : null
    this.baseline = this.field ? this.field.heights.slice() : null
    this.chunks.clear()
    this.strokeRect = null
    this.mesh = EMPTY_MESH
    this.sampler = this.origin && !this.field ? createTerrainSampler(document, { tilesOverride: tiles }) : null
    this.committed = this.origin && !this.field ? createTerrainSampler(document) : null
    for (const map of this.registered) this.ensureLayer(map)
    this.refresh()
  }

  /** After a frame's dabs: with the field, rewrite `rect` in it and rebuild only the chunks it touched. */
  update(rect?: Rect): void {
    const field = this.field
    if (!field || !this.document || !this.tiles) {
      this.refresh()
      return
    }
    const written = field.update(this.document, rect ?? this.wholeField(field), this.tiles)
    this.strokeRect = this.strokeRect ? union(this.strokeRect, written) : written
    const { x0, y0, cols, rows } = field.area
    const baseline = this.baseline!
    const changed = (x: number, y: number) => {
      const c = x - x0
      const r = y - y0
      if (c < 0 || r < 0 || c >= cols || r >= rows) return false
      const i = r * cols + c
      return Math.abs(field.heights[i] - baseline[i]) >= SAME_M
    }
    const skipCell = (x: number, y: number) => !changed(x, y) && !changed(x + 1, y) && !changed(x, y + 1) && !changed(x + 1, y + 1)
    // A cell's triangles reach one metre past its corner, so a change at the rect's edge also touches the cell before it.
    for (let cx = Math.floor((written.minX - 1) / CHUNK_M); cx <= Math.floor(written.maxX / CHUNK_M); cx++) {
      for (let cy = Math.floor((written.minY - 1) / CHUNK_M); cy <= Math.floor(written.maxY / CHUNK_M); cy++) {
        const patch = { id: '0_0' as TileId, x0: cx * CHUNK_M, y0: cy * CHUNK_M, x1: cx * CHUNK_M + CHUNK_M - 1, y1: cy * CHUNK_M + CHUNK_M - 1 }
        const mesh = terrainPreviewMesh([patch], { heightAt: (x, y) => field.heightAt(x, y), color: PREVIEW_COLOR, skipCell })
        if (mesh.length > 0) this.chunks.set(`${cx}_${cy}`, mesh)
        else this.chunks.delete(`${cx}_${cy}`)
      }
    }
    let total = 0
    for (const m of this.chunks.values()) total += m.length
    const all = new Float32Array(total)
    let offset = 0
    for (const m of this.chunks.values()) {
      all.set(m, offset)
      offset += m.length
    }
    this.mesh = all
    this.refresh()
  }

  /** Test/probe access: the chunks drawn now ("cx_cy", 32 m each) and one chunk's mesh. */
  chunkKeys(): string[] {
    return [...this.chunks.keys()]
  }
  chunk(key: string): Float32Array | undefined {
    return this.chunks.get(key)
  }

  /** The stroke's command was dispatched: hand off to the committed tiles on each map's next idle. */
  commit(): void {
    this.cancelCommits()
    // The field already holds the stroke's ground, which is now committed: nothing to put back any more.
    this.strokeRect = null
    this.chunks.clear()
    for (const map of this.layers.keys()) {
      const listener = () => {
        this.layerOn(map)?.setMesh(EMPTY_MESH)
        if (this.field) this.mesh = EMPTY_MESH
        this.pending = this.pending.filter((p) => p.map !== map)
      }
      map.once('idle', listener)
      this.pending.push({ map, listener })
    }
  }

  /** Cancel (Esc, errors, unmount): clear now, forget the pending idle clears. */
  cancel(): void {
    this.cancelCommits()
    if (this.field && this.document && this.strokeRect) this.field.update(this.document, this.strokeRect)
    this.strokeRect = null
    this.chunks.clear()
    this.mesh = EMPTY_MESH
    this.clearAll()
  }

  /** Route unmount: everything dies with the maps, nothing lingers. */
  dispose(): void {
    this.cancel()
    this.layers.clear()
    this.registered = []
    this.tiles = null
    this.sampler = null
    this.committed = null
    this.document = null
    this.field = null
    this.baseline = null
  }

  /** Probe/test access to the per-map preview layer. */
  layerOn(map: maplibregl.Map): MeshLayer | null {
    return this.layers.get(map) ?? null
  }

  private ensureLayer(map: maplibregl.Map): void {
    if (this.layers.has(map) || !this.origin) return
    const attachNow = () => {
      if (this.layers.has(map)) return
      const layer = createMeshLayer(PREVIEW_LAYER_ID, this.origin!)
      map.addLayer(layer, overlayAnchor(map))
      this.layers.set(map, layer)
      layer.setMesh(this.meshData())
      layer.setVerticalScale(this.scaleOf(map))
    }
    whenStyleReady(map, attachNow)
  }

  private refresh(): void {
    for (const [map, layer] of this.layers) {
      layer.setMesh(this.meshData())
      layer.setVerticalScale(this.scaleOf(map))
    }
  }

  private meshData(): Float32Array {
    if (this.field) return this.mesh
    const sampler = this.sampler
    const tiles = this.tiles
    if (!sampler || !tiles || tiles.size === 0) return EMPTY_MESH
    const patches = terrainPreviewPatches(tiles)
    if (patches.length === 0) return EMPTY_MESH
    const committed = this.committed
    const same = (x: number, y: number) => !committed || Math.abs(sampler.heightAt(x, y) - committed.heightAt(x, y)) < 0.005
    return terrainPreviewMesh(patches, {
      heightAt: (x, y) => sampler.heightAt(x, y),
      color: PREVIEW_COLOR,
      skipCell: committed ? (x, y) => same(x, y) && same(x + 1, y) && same(x, y + 1) && same(x + 1, y + 1) : undefined,
    })
  }

  /** The stair-mesh rule (ledger ruling): exaggeration (clamped 1–5) when tilted, 0 flat on top. */
  private scaleOf(map: maplibregl.Map): number {
    return map.getPitch() > 2 ? this.exaggeration : 0
  }

  private wholeField(field: HeightField): Rect {
    const { x0, y0, cols, rows } = field.area
    return { minX: x0, minY: y0, maxX: x0 + cols - 1, maxY: y0 + rows - 1 }
  }

  private clearAll(): void {
    for (const layer of this.layers.values()) layer.setMesh(EMPTY_MESH)
  }

  private cancelCommits(): void {
    for (const { map, listener } of this.pending) map.off('idle', listener)
    this.pending = []
  }
}

const union = (a: Rect, b: Rect): Rect => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) })

export function createTerrainPaintPreview(): TerrainPaintPreview {
  return new TerrainPaintPreview()
}
