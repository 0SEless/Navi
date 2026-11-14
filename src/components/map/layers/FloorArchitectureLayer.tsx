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
  return null
}
