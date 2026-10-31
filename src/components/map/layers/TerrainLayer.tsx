'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import type { TerrainArea, TerrainVerticalDatum } from '@navi/core'
import { terrainAreasToGeoJSON } from './terrain-layer-geojson'

export const PUBLIC_TERRAIN_SOURCE_ID = 'public-authored-terrain'
export const PUBLIC_TERRAIN_FILL_LAYER_ID = 'public-authored-terrain-fill'
export const PUBLIC_TERRAIN_OUTLINE_LAYER_ID = 'public-authored-terrain-outline'

const EMPTY_DATA = { type: 'FeatureCollection' as const, features: [] }

export interface TerrainLayerProps {
  map: maplibregl.Map | null
  areas?: TerrainArea[]
  datum?: TerrainVerticalDatum
}

export function TerrainLayer({ map, areas = [], datum }: TerrainLayerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const areasRef = useRef(areas)
  const datumNameRef = useRef(datum?.name ?? '')
  const overlayRef = useRef<HTMLDivElement>(null)

  const data = useMemo(() => terrainAreasToGeoJSON(areas, datum?.name ?? ''), [areas, datum?.name])
  const selected = areas.find((area) => area.id === selectedId) ?? null

  const recordRenderedFeatureCount = useCallback(() => {
    if (!map) return
    const area = areasRef.current[0]
    const overlay = overlayRef.current
    if (!overlay) return
    if (!area || area.points.length < 3) {
      overlay.setAttribute('data-map-rendered-feature-count', '0')
      overlay.setAttribute('data-map-source-feature-count', '0')
      return
    }
    const sourceFeatures = map.querySourceFeatures(PUBLIC_TERRAIN_SOURCE_ID)
    const renderedFeatures = map.queryRenderedFeatures({ layers: [PUBLIC_TERRAIN_FILL_LAYER_ID] })
    overlay.setAttribute('data-map-source-feature-count', String(sourceFeatures.filter((feature) => feature.properties?.id === area.id).length))
    overlay.setAttribute('data-map-viewport-feature-count', String(renderedFeatures.filter((feature) => feature.properties?.id === area.id).length))
    const center = area.points.reduce((sum, point) => ({ lng: sum.lng + point.lng, lat: sum.lat + point.lat }), { lng: 0, lat: 0 })
    const position: [number, number] = [center.lng / area.points.length, center.lat / area.points.length]
    const rendered = map.queryRenderedFeatures(map.project(position), { layers: [PUBLIC_TERRAIN_FILL_LAYER_ID] })
    overlay.setAttribute('data-map-rendered-feature-count', String(rendered.filter((feature) => feature.properties?.id === area.id).length))
    overlay.setAttribute('data-map-diagnostic', JSON.stringify({
      styleLoaded: map.isStyleLoaded(),
      hasSource: Boolean(map.getSource(PUBLIC_TERRAIN_SOURCE_ID)),
      hasFillLayer: Boolean(map.getLayer(PUBLIC_TERRAIN_FILL_LAYER_ID)),
      center: map.getCenter().toArray(),
      zoom: map.getZoom(),
      bounds: map.getBounds().toArray(),
      areaCenter: position,
      projectedAreaCenter: (() => {
        const point = map.project(position)
        return [point.x, point.y]
      })(),
    }))
  }, [map])

  const queueRenderedFeatureCheck = useCallback(() => {
    if (!map) return
    // The initial camera fit may finish after terrain source installation. A
    // moveend check covers that case; idle covers unchanged camera/style loads.
    map.once('moveend', recordRenderedFeatureCount)
    map.once('idle', recordRenderedFeatureCount)
  }, [map, recordRenderedFeatureCount])

  useEffect(() => {
    if (!map) return
    const updateSource = () => {
      const source = map.getSource(PUBLIC_TERRAIN_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
      source?.setData(terrainAreasToGeoJSON(areasRef.current, datumNameRef.current))
    }
    const ensureLayers = () => {
      if (!map.isStyleLoaded()) return
      if (!map.getSource(PUBLIC_TERRAIN_SOURCE_ID)) {
        map.addSource(PUBLIC_TERRAIN_SOURCE_ID, { type: 'geojson', data: EMPTY_DATA })
      }
      if (!map.getLayer(PUBLIC_TERRAIN_FILL_LAYER_ID)) {
        map.addLayer({
          id: PUBLIC_TERRAIN_FILL_LAYER_ID,
          type: 'fill',
          source: PUBLIC_TERRAIN_SOURCE_ID,
          paint: {
            'fill-color': [
              'step', ['get', 'elevationMeters'], '#2563EB',
              0, '#0F766E',
              2, '#15803D',
              5, '#A16207',
              10, '#B91C1C',
            ],
            'fill-opacity': 0.34,
          },
        })
      }
      if (!map.getLayer(PUBLIC_TERRAIN_OUTLINE_LAYER_ID)) {
        map.addLayer({
          id: PUBLIC_TERRAIN_OUTLINE_LAYER_ID,
          type: 'line',
          source: PUBLIC_TERRAIN_SOURCE_ID,
          paint: { 'line-color': '#263238', 'line-width': 1.5, 'line-opacity': 0.9 },
        })
      }
      updateSource()
      queueRenderedFeatureCheck()
    }
    const handleFeatureClick = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id
      if (typeof id === 'string') setSelectedId(id)
    }
    const setPointer = () => { map.getCanvas().style.cursor = 'pointer' }
    const resetPointer = () => { map.getCanvas().style.cursor = '' }

    if (map.isStyleLoaded()) ensureLayers()
    map.on('load', ensureLayers)
    map.on('styledata', ensureLayers)
    map.on('click', PUBLIC_TERRAIN_FILL_LAYER_ID, handleFeatureClick)
    map.on('mouseenter', PUBLIC_TERRAIN_FILL_LAYER_ID, setPointer)
    map.on('mouseleave', PUBLIC_TERRAIN_FILL_LAYER_ID, resetPointer)
    return () => {
      map.off('load', ensureLayers)
      map.off('styledata', ensureLayers)
      map.off('click', PUBLIC_TERRAIN_FILL_LAYER_ID, handleFeatureClick)
      map.off('mouseenter', PUBLIC_TERRAIN_FILL_LAYER_ID, setPointer)
      map.off('mouseleave', PUBLIC_TERRAIN_FILL_LAYER_ID, resetPointer)
    }
  }, [map, queueRenderedFeatureCheck])

  useEffect(() => {
    areasRef.current = areas
    datumNameRef.current = datum?.name ?? ''
    const source = map?.getSource(PUBLIC_TERRAIN_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    source?.setData(data)
    queueRenderedFeatureCheck()
  }, [areas, data, datum?.name, map, queueRenderedFeatureCheck])

  if (areas.length === 0) return null

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-20" data-testid="terrain-runtime-overlay">
      <aside
        aria-label="Published terrain areas"
        className="pointer-events-auto absolute left-3 top-3 max-h-[45%] w-[min(18rem,calc(100%-1.5rem))] overflow-y-auto rounded-xl border border-slate-300 bg-white/95 p-3 text-slate-900 shadow-lg"
        data-testid="terrain-runtime-panel"
      >
        <h2 className="text-sm font-semibold">Terrain elevations</h2>
        <p className="mt-1 text-xs text-slate-700">
          Authored values relative to {datum?.name || 'the campus-local datum'}; not surveyed.
        </p>
        <ul className="mt-2 space-y-1">
          {areas.map((area) => (
            <li key={area.id}>
              <button
                type="button"
                className="min-h-10 w-full rounded-md px-2 py-1 text-left text-sm hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
                aria-pressed={selectedId === area.id}
                onClick={() => setSelectedId(area.id)}
                data-testid={`terrain-runtime-select-${area.id}`}
              >
                <span className="block font-medium">{area.name}</span>
                <span className="block text-xs text-slate-700">{area.elevationMeters} m</span>
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <section className="mt-2 rounded-lg border border-slate-300 bg-slate-50 p-2" aria-live="polite" data-testid="terrain-inspection-panel">
            <h3 className="text-sm font-semibold">{selected.name}</h3>
            <p className="mt-1 text-sm">Authored elevation: {selected.elevationMeters} m</p>
            <p className="text-xs text-slate-700">Relative to {datum?.name || 'the campus-local datum'}; not surveyed.</p>
          </section>
        ) : null}
        <div className="mt-2 border-t border-slate-200 pt-2 text-[11px] text-slate-700" aria-label="Terrain elevation color key">
          Lower · teal · green · amber · higher
        </div>
      </aside>
    </div>
  )
}
