'use client'

import { useEffect, useMemo, useState } from 'react'
import { createTerrainSampler, toLocal, type CampusDocument, type TerrainSampler, type TerrainSamplerOptions } from '@navi/core'
import { registerTerrainProtocol } from './dem-protocol'

export const HEIGHTS_SCHEME = 'navi-terrain'
export const CHANGES_SCHEME = 'navi-terrain-changes'

// One protocol pair for the whole tab; every terrain map (main and mini) reads the current sampler.
let current: TerrainSampler | null = null
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
    current = sampler
    setVersion((v) => v + 1)
  }, [sampler])

  return { sampler, version }
}
