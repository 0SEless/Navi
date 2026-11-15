'use client'

import { useEffect } from 'react'
import type maplibregl from 'maplibre-gl'
import { toLatLng, type TerrainGrid } from '@navi/core'
import { steepnessImage } from '@/lib/terrain/steepness'
import { currentHeightField } from '@/lib/terrain/use-terrain-sampler'
import { FIRST_OVERLAY_LAYER } from '@/lib/terrain/terrain-view'

export const STEEP_SOURCE = 'terrain-too-steep'
export const STEEP_LAYER = 'terrain-too-steep'

/** Top-bar switch for the Too steep view (owner 2026-11-15). */
export function SteepToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => onChange(!on)}
      title="Colour ground steeper than 1 in 4 (amber) and 1 in 2 (red)"
      style={{
        padding: '3px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
        border: `1px solid ${on ? '#d97706' : 'var(--navi-border, #d1d5db)'}`,
        background: on ? '#fef3c7' : 'var(--navi-card, #fff)', color: on ? '#92400e' : 'var(--navi-text, #111827)',
      }}>Too steep</button>
  )
}

function remove(map: maplibregl.Map): void {
  try {
    if (map.getLayer(STEEP_LAYER)) map.removeLayer(STEEP_LAYER)
    if (map.getSource(STEEP_SOURCE)) map.removeSource(STEEP_SOURCE)
  } catch { /* map already removed */ }
}

/** Draws the Too steep colours over the ground while `on`; redraws when the ground changes (`version`). */
export function useSteepLayer(map: maplibregl.Map | null, grid: TerrainGrid | null, on: boolean, version: number): void {
  useEffect(() => {
    if (!map || !grid || !on) return
    const field = currentHeightField()
    if (!field) return
    const image = steepnessImage(field)
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) return
    context.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0)
    const { x0, y0, cols, rows } = field.area
    const corner = (x: number, y: number): [number, number] => { const p = toLatLng(grid, { x, y }); return [p.lng, p.lat] }
    const west = x0 - 0.5, east = x0 + cols - 0.5, south = y0 - 0.5, north = y0 + rows - 0.5
    const coordinates: [[number, number], [number, number], [number, number], [number, number]] =
      [corner(west, north), corner(east, north), corner(east, south), corner(west, south)]
    const url = canvas.toDataURL('image/png')
    const source = map.getSource(STEEP_SOURCE) as maplibregl.ImageSource | undefined
    if (source) source.updateImage({ url, coordinates })
    else {
      map.addSource(STEEP_SOURCE, { type: 'image', url, coordinates })
      map.addLayer({ id: STEEP_LAYER, type: 'raster', source: STEEP_SOURCE, paint: { 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } },
        map.getLayer(FIRST_OVERLAY_LAYER) ? FIRST_OVERLAY_LAYER : undefined)
    }
  }, [map, grid, on, version])
  useEffect(() => {
    if (!map || on) return
    remove(map)
  }, [map, on])
  useEffect(() => () => { if (map) remove(map) }, [map])
}
