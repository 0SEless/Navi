'use client'

import { useEffect, useMemo, useState } from 'react'
import { createHeightField, createTerrainSampler, parseTileId, toLatLng, toLocal, TILE_CELLS, type CampusDocument, type HeightField, type Rect, type TerrainGrid, type TerrainSampler, type TerrainSamplerOptions } from '@navi/core'
import { registerTerrainProtocol, terrainTileCache, type LngLatBox } from './dem-protocol'
import { createTerrainWorkerClient, type WorkerLike } from './terrain-worker-client'

export const HEIGHTS_SCHEME = 'navi-terrain'
export const CHANGES_SCHEME = 'navi-terrain-changes'

// One protocol pair for the whole tab; every terrain map (main and mini) reads the current sampler.
let current: TerrainSampler | null = null
let pendingDirty: LngLatBox | 'all' | null = null
// The height field of the current document (smooth sculpting): lookups read it; a marked change updates only its
// rectangle, anything unmarked rebuilds it. One per tab, like the protocols.
let field: HeightField | null = null
let fieldGrid: TerrainGrid | null = null

// One module worker per tab builds elevation tiles and contour lines from a copy of the field (the main thread
// does it when the worker is missing or fails). Samplers read from the field are marked, so a stroke's
// working-tile sampler (not in the worker's copy) never gets worker tiles.
const worker = createTerrainWorkerClient(() =>
  typeof Worker === 'undefined' ? null : (new Worker(new URL('./terrain-worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike),
)
const fieldBacked = new WeakSet<TerrainSampler>()

/** Which elevation tiles the last ground change needs reloaded: every tile, or these z/x/y only. */
export let lastTileRefresh: { all: boolean; tiles: Array<{ z: number; x: number; y: number }> } = { all: true, tiles: [] }

function tileFromWorker(scheme: 'heights' | 'changes') {
  return (z: number, x: number, y: number) => (current && fieldBacked.has(current) ? worker.tile(scheme, z, x, y) : null)
}

/** Contour lines over `bbox` (local metres) from the worker, or null: build them on the main thread. */
export function contoursFromWorker(bbox: Rect): Promise<GeoJSON.FeatureCollection | null> | null {
  return current && fieldBacked.has(current) ? worker.contours(bbox) : null
}

/** The tab's height field (the paint preview updates it in place while a stroke is live). */
export function currentHeightField(): HeightField | null {
  return field
}

/** Brings the field up to `document`: the marked area only, or a rebuild. */
function syncField(document: CampusDocument, grid: TerrainGrid): HeightField | null {
  const dirty = pendingDirty
  const sameGrid = field && fieldGrid && fieldGrid.originLat === grid.originLat && fieldGrid.originLng === grid.originLng
  if (field && sameGrid && dirty && dirty !== 'all') {
    // NO_AREA (an inverted box: stairs, presets) changes no ground.
    if (dirty.west <= dirty.east && dirty.south <= dirty.north) {
      const sw = toLocal(grid, { lat: dirty.south, lng: dirty.west })
      const ne = toLocal(grid, { lat: dirty.north, lng: dirty.east })
      worker.send(field, field.update(document, { minX: sw.x, minY: sw.y, maxX: ne.x, maxY: ne.y }))
    }
    return field
  }
  field = createHeightField(document)
  fieldGrid = field ? grid : null
  if (field) worker.send(field)
  else worker.forget()
  return field
}

/** Bounds of change tiles (plus 10 m so hillshade edges refresh too). */
export function tilesBounds(grid: TerrainGrid, tileIds: Iterable<string>): LngLatBox | null {
  let box: LngLatBox | null = null
  for (const id of tileIds) {
    const { col, row } = parseTileId(id)
    const sw = toLatLng(grid, { x: col * TILE_CELLS - 10, y: row * TILE_CELLS - 10 })
    const ne = toLatLng(grid, { x: (col + 1) * TILE_CELLS + 10, y: (row + 1) * TILE_CELLS + 10 })
    box = box
      ? { west: Math.min(box.west, sw.lng), east: Math.max(box.east, ne.lng), south: Math.min(box.south, sw.lat), north: Math.max(box.north, ne.lat) }
      : { west: sw.lng, east: ne.lng, south: sw.lat, north: ne.lat }
  }
  return box
}

/** "Nothing changed" (an inverted box: it overlaps no tile and disappears in a union). */
export const NO_AREA: LngLatBox = { west: 1000, east: -1000, south: 1000, north: -1000 }

/** Tells the next ground update which area changed (anything unmarked regenerates every tile). */
export function markTerrainDirty(area: LngLatBox | 'all' | null): void {
  if (!area) return
  if (area === 'all' || pendingDirty === 'all') pendingDirty = 'all'
  else if (!pendingDirty) pendingDirty = area
  else pendingDirty = {
    west: Math.min(pendingDirty.west, area.west), east: Math.max(pendingDirty.east, area.east),
    south: Math.min(pendingDirty.south, area.south), north: Math.max(pendingDirty.north, area.north),
  }
}
let users = 0
let unregister: Array<() => void> = []

function heightAtLatLng(): ((lat: number, lng: number) => number) | null {
  const sampler = current
  if (!sampler) return null
  return (lat, lng) => {
    const p = toLocal(sampler.grid, { lat, lng })
    return sampler.heightAt(p.x, p.y)
  }
}

function changeAtLatLng(): ((lat: number, lng: number) => number) | null {
  const sampler = current
  if (!sampler) return null
  return (lat, lng) => {
    const p = toLocal(sampler.grid, { lat, lng })
    return sampler.changeAt(p.x, p.y)
  }
}

/**
 * The terrain sampler for the document (plus a stroke's working tiles), published to the terrain tile
 * protocols. `version` changes whenever the ground may have changed, so maps reload their tiles.
 */
export function useTerrainSampler(document: CampusDocument, documentVersion: number, opts?: TerrainSamplerOptions & { overrideVersion?: number }): { sampler: TerrainSampler | null; version: number } {
  const sampler = useMemo(
    (): TerrainSampler | null => {
      const exact = createTerrainSampler(document, opts?.tilesOverride ? { tilesOverride: opts.tilesOverride } : {})
      if (!exact || opts?.tilesOverride) return exact
      const f = syncField(document, exact.grid)
      if (!f) return exact
      const read: TerrainSampler = { ...exact, heightAt: (x: number, y: number) => f.heightAt(x, y), changeAt: (x: number, y: number) => f.changeAt(x, y) }
      fieldBacked.add(read)
      return read
    },
    // documentVersion / overrideVersion stand for in-place changes of the document and the working tiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [document, documentVersion, opts?.tilesOverride, opts?.overrideVersion],
  )
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (users++ === 0) {
      unregister = [
        registerTerrainProtocol(HEIGHTS_SCHEME, heightAtLatLng, tileFromWorker('heights')),
        registerTerrainProtocol(CHANGES_SCHEME, changeAtLatLng, tileFromWorker('changes')),
      ]
    }
    return () => {
      if (--users === 0) {
        unregister.forEach((off) => off())
        unregister = []
        current = null
      }
    }
  }, [])

  useEffect(() => {
    const area = pendingDirty ?? 'all'
    // Maps reload only the tiles they were handed that overlap a marked change (map.refreshTiles); else all.
    lastTileRefresh = area === 'all' ? { all: true, tiles: [] } : { all: false, tiles: terrainTileCache.tilesIn(area) }
    terrainTileCache.invalidate(area)
    pendingDirty = null
    current = sampler
    setVersion((v) => v + 1)
  }, [sampler])

  return { sampler, version }
}
