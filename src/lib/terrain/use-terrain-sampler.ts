'use client'

import { useEffect, useMemo, useState } from 'react'
import { createTerrainSampler, parseTileId, toLatLng, toLocal, TILE_CELLS, type CampusDocument, type TerrainGrid, type TerrainSampler, type TerrainSamplerOptions } from '@navi/core'
import { registerTerrainProtocol, terrainTileCache, type LngLatBox } from './dem-protocol'

export const HEIGHTS_SCHEME = 'navi-terrain'
export const CHANGES_SCHEME = 'navi-terrain-changes'

// One protocol pair for the whole tab; every terrain map (main and mini) reads the current sampler.
let current: TerrainSampler | null = null
let pendingDirty: LngLatBox | 'all' | null = null

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
    () => createTerrainSampler(document, opts?.tilesOverride ? { tilesOverride: opts.tilesOverride } : {}),
    // documentVersion / overrideVersion stand for in-place changes of the document and the working tiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [document, documentVersion, opts?.tilesOverride, opts?.overrideVersion],
  )
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (users++ === 0) {
      unregister = [registerTerrainProtocol(HEIGHTS_SCHEME, heightAtLatLng), registerTerrainProtocol(CHANGES_SCHEME, changeAtLatLng)]
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
    terrainTileCache.invalidate(pendingDirty ?? 'all')
    pendingDirty = null
    current = sampler
    setVersion((v) => v + 1)
  }, [sampler])

  return { sampler, version }
}
