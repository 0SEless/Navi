import type maplibregl from 'maplibre-gl'
import {
  createTerrainSampler,
  terrainPreviewMesh,
  terrainPreviewPatches,
  type CampusDocument,
  type TerrainSampler,
  type TileId,
} from '@navi/core'
import { overlayAnchor } from '@/lib/terrain/terrain-view'
import { createMeshLayer, type MeshLayer } from './mesh-layer'
import { whenStyleReady } from '@/lib/terrain/style-ready'

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
  private exaggeration = 1
  private pending: Array<{ map: maplibregl.Map; listener: () => void }> = []

  /** The route's current maps and the view's exaggeration; called on every render. */
  setMaps(maps: maplibregl.Map[], exaggeration: number): void {
    this.exaggeration = Math.min(5, Math.max(1, exaggeration))
    this.registered = [...maps]
    for (const [map, layer] of [...this.layers]) if (!maps.includes(map)) this.layers.delete(map)
    for (const map of this.registered) this.ensureLayer(map)
    for (const [map, layer] of this.layers) layer.setVerticalScale(this.scaleOf(map))
  }

  /** A stroke began: remember its working tiles (read live), build its own sampler, paint. */
  start(document: CampusDocument, tiles: Map<TileId, Int16Array>): void {
    this.cancelCommits()
    this.tiles = tiles
    this.origin = document.terrain ? { lat: document.terrain.grid.originLat, lng: document.terrain.grid.originLng } : null
    this.sampler = this.origin ? createTerrainSampler(document, { tilesOverride: tiles }) : null
    for (const map of this.registered) this.ensureLayer(map)
    this.refresh()
  }

  /** After one dab: rebuild the patch meshes (cheap: tile-bounded triangles). */
  update(): void {
    this.refresh()
  }

  /** The stroke's command was dispatched: hand off to the committed tiles on each map's next idle. */
  commit(): void {
    this.cancelCommits()
    for (const map of this.layers.keys()) {
      const listener = () => {
        this.layerOn(map)?.setMesh(EMPTY_MESH)
        this.pending = this.pending.filter((p) => p.map !== map)
      }
      map.once('idle', listener)
      this.pending.push({ map, listener })
    }
  }

  /** Cancel (Esc, errors, unmount): clear now, forget the pending idle clears. */
  cancel(): void {
    this.cancelCommits()
    this.clearAll()
  }

  /** Route unmount: everything dies with the maps, nothing lingers. */
  dispose(): void {
    this.cancel()
    this.layers.clear()
    this.registered = []
    this.tiles = null
    this.sampler = null
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
    const sampler = this.sampler
    const tiles = this.tiles
    if (!sampler || !tiles || tiles.size === 0) return EMPTY_MESH
    const patches = terrainPreviewPatches(tiles)
    if (patches.length === 0) return EMPTY_MESH
    return terrainPreviewMesh(patches, { heightAt: (x, y) => sampler.heightAt(x, y), color: PREVIEW_COLOR })
  }

  /** The stair-mesh rule (ledger ruling): exaggeration (clamped 1–5) when tilted, 0 flat on top. */
  private scaleOf(map: maplibregl.Map): number {
    return map.getPitch() > 2 ? this.exaggeration : 0
  }

  private clearAll(): void {
    for (const layer of this.layers.values()) layer.setMesh(EMPTY_MESH)
  }

  private cancelCommits(): void {
    for (const { map, listener } of this.pending) map.off('idle', listener)
    this.pending = []
  }
}

export function createTerrainPaintPreview(): TerrainPaintPreview {
  return new TerrainPaintPreview()
}
