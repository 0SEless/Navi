'use client'

import { useMemo } from 'react'
import type maplibregl from 'maplibre-gl'
import { effectiveBuildingBase, toLocal, type CampusDocument, type TerrainSampler } from '@navi/core'
import { FloorArchitectureLayer } from '@/components/map/layers/FloorArchitectureLayer'
import { terrainFloorStack, type OpenFloors } from '@/lib/terrain/terrain-floors'

/**
 * The open building's floors in the terrain editor, drawn by NAVI Web's own floor layer (owner 2026-11-15:
 * "one view"), so stairs and ramps meet real floor edges instead of a plain block.
 */
export function TerrainFloorsLayer({ map, document, sampler, open, threeD }: {
  map: maplibregl.Map | null
  document: CampusDocument
  sampler: TerrainSampler | null
  open: OpenFloors | null
  threeD: boolean
}) {
  const architecture = useMemo(() => (threeD ? terrainFloorStack(document, open) : undefined), [document, open, threeD])
  const building = open ? document.buildings.find((b) => b.id === open.buildingId) : undefined
  const level = useMemo(() => {
    if (!sampler || !building) return undefined
    const ground = (p: { lat: number; lng: number }) => { const q = toLocal(sampler.grid, p); return sampler.heightAt(q.x, q.y) }
    return { ground, floorM: effectiveBuildingBase(building, sampler) }
  }, [sampler, building])
  const floorAreas = useMemo(() => (building ? [building.footprint?.points ?? []] : undefined), [building])
  // Mounted only while a building is open; unmounting removes its layers.
  if (!architecture) return null
  return <FloorArchitectureLayer map={map} architecture={architecture} level={level} floorAreas={floorAreas} />
}
