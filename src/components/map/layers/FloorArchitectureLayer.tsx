'use client'
import { useEffect } from 'react'
import type maplibregl from 'maplibre-gl'
import type { FloorArchitectureRenderData } from '@/components/map/NavigationRenderModel'
import { styleReady } from '@/lib/terrain/style-ready'
import { OPENING_SYMBOL_LAYER_IDS, doorExtrusionColor, syncOpeningSymbolLayers } from '@/lib/opening-symbol-layers'

export function selectFloorArchitecture(records: FloorArchitectureRenderData[] | undefined, context: { active: boolean; buildingId?: string }, floor: number, pitched: boolean): FloorArchitectureRenderData | undefined {
  return pitched && context.active && context.buildingId ? records?.find(record => record.buildingId === context.buildingId && record.floor === floor) : undefined
}
export function floorArchitectureFallback<T extends { id: string; buildingId: string; floor: number }>(records: T[], architecture: FloorArchitectureRenderData | undefined, kind: keyof FloorArchitectureRenderData['modeledIds']): T[] {
  return architecture ? records.filter(record => record.buildingId !== architecture.buildingId || record.floor !== architecture.floor || !architecture.modeledIds[kind].includes(record.id)) : records
}
const kinds = ['walls', 'frames', 'panels', 'stairs', 'glass'] as const
const colors = { walls: '#cbd5e1', frames: '#64748b', panels: '#a88463', stairs: '#94a3b8', glass: '#7dd3fc' }
export interface FloorArchitectureLayerProps { map: maplibregl.Map | null; architecture?: FloorArchitectureRenderData }

/** All polygons arrive in world coordinates; extrusion heights stay in meters. */
export function FloorArchitectureLayer({ map, architecture }: FloorArchitectureLayerProps) {
  useEffect(() => {
    if (!map) return
    const sync = () => {
      if (!styleReady(map)) return
      for (const kind of kinds) {
        const id = `floor-architecture-${kind}`
        const data = architecture?.[kind] ?? { type: 'FeatureCollection' as const, features: [] }
        const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined
        if (source) source.setData(data)
        else map.addSource(id, { type: 'geojson', data })
        if (!map.getLayer(id)) map.addLayer({ id, source: id, type: 'fill-extrusion', paint: {
          'fill-extrusion-color': doorExtrusionColor(colors[kind]), 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': kind === 'glass' ? 0.3 : 1,
        } })
      }
      syncOpeningSymbolLayers(map, architecture?.symbols, true)
    }
    sync()
    map.on('style.load', sync)
    const onSourceData = () => { if (kinds.some(kind => !map.getSource(`floor-architecture-${kind}`) || !map.getLayer(`floor-architecture-${kind}`))) sync() }
    map.on('sourcedata', onSourceData)
    map.on('resize', sync)
    return () => {
      map.off('style.load', sync)
      map.off('sourcedata', onSourceData)
      map.off('resize', sync)
      for (const id of OPENING_SYMBOL_LAYER_IDS) { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id) }
      for (const kind of [...kinds].reverse()) { const id = `floor-architecture-${kind}`; if (map.getLayer(id)) map.removeLayer(id) }
      for (const kind of kinds) { const id = `floor-architecture-${kind}`; if (map.getSource(id)) map.removeSource(id) }
    }
  }, [map, architecture])

  // While a floor of a building is shown, open that building up: hide its shell and its terrain block,
  // so the walls, doors, windows and stairs inside are visible. Other buildings stay as they are.
  const openBuildingId = architecture?.buildingId
  useEffect(() => {
    if (!map || !openBuildingId) return
    const apply = () => {
      try {
        if (map.getLayer(SHELL_LAYER)) map.setFilter(SHELL_LAYER, ['!=', ['get', 'id'], openBuildingId])
        if (map.getLayer(SLAB_LAYER)) map.setFilter(SLAB_LAYER, ['!=', ['get', 'buildingId'], openBuildingId])
      } catch { /* map removed */ }
    }
    apply()
    // The shell and site layers may be created after this one (terrain campuses load late).
    map.on('sourcedata', apply)
    return () => {
      map.off('sourcedata', apply)
      try {
        if (map.getLayer(SHELL_LAYER)) map.setFilter(SHELL_LAYER, null)
        if (map.getLayer(SLAB_LAYER)) map.setFilter(SLAB_LAYER, null)
      } catch { /* map removed */ }
    }
  }, [map, openBuildingId])
  return null
}

/** The translucent building shell (BuildingLayer) and the solid terrain block (SiteLayers). */
const SHELL_LAYER = 'buildings-extrusion'
const SLAB_LAYER = 'site-slabs'
