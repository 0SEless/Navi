'use client'

import { useEffect, useRef } from 'react'
import type maplibregl from 'maplibre-gl'
import { toLatLng, toLocal, type BrushSettings, type CampusDocument, type TerrainSampler, type TileId } from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'
import { createTerrainStroke, gridArea, type BrushTool, type TerrainStroke } from '@/lib/terrain/terrain-stroke'
import { brushOutline } from '@/lib/terrain/brush-outline'
import type { TerrainTool } from './TerrainToolRail'

const BRUSH_SOURCE = 'terrain-brush'
const BRUSH_LAYER = 'terrain-brush'
const BRUSH_TOOLS: ReadonlySet<TerrainTool> = new Set(['raise-lower', 'smooth', 'flatten'])

export interface TerrainStrokeOptions {
  document: CampusDocument
  sampler: TerrainSampler | null
  tool: TerrainTool
  settings: BrushSettings
  enabled: boolean
  dispatch: (command: Command) => MutationResult | undefined
  /** The stroke began: the live working tiles map (dabs mutate it in place). */
  onStrokeStart: (tiles: Map<TileId, Int16Array>) => void
  /** One effective dab: paint the instant preview now (never touches the committed terrain). */
  onDab: () => void
  /** The stroke's command was dispatched successfully: hand the preview off to the committed tiles. */
  onStrokeEnd: () => void
  /** Nothing to commit (no change) or the dispatch failed: clean the preview at once. */
  onStrokeCancel: () => void
  /** Height picker: Alt+click with a brush, or a click with the picker tool. */
  onPick: (heightM: number) => void
}

function ensureBrushLayer(map: maplibregl.Map): void {
  if (!map.getSource(BRUSH_SOURCE)) map.addSource(BRUSH_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  if (!map.getLayer(BRUSH_LAYER)) {
    map.addLayer({ id: BRUSH_LAYER, type: 'line', source: BRUSH_SOURCE, paint: { 'line-color': ['case', ['get', 'inside'], '#111827', '#9ca3af'], 'line-width': 1.5 } })
  }
}

/** Paints with the active brush on `map` (main or mini view): one stroke = one undo step. */
export function useTerrainStroke(map: maplibregl.Map | null, options: TerrainStrokeOptions): void {
  const latest = useRef(options)
  // The options are read inside event handlers only; keeping them in a ref updated on every commit
  // means the handlers always see the latest tool/settings/document without re-registering events.
  useEffect(() => {
    latest.current = options
  })

  useEffect(() => {
    if (!map) return
    let stroke: TerrainStroke | null = null
    let last: { x: number; y: number } | null = null
    let pointer: { lat: number; lng: number } | null = null
    let repeat: number | null = null

    // Holding the mouse still keeps painting (Unity-style): one dab every 80 ms at the pointer.
    const startRepeat = () => {
      repeat = window.setInterval(() => {
        if (stroke && pointer && stroke.dab(pointer)) latest.current.onDab()
      }, 80)
    }
    const stopRepeat = () => {
      if (repeat !== null) window.clearInterval(repeat)
      repeat = null
    }

    const outline = (lngLat: maplibregl.LngLat) => {
      const { document, settings, tool } = latest.current
      const terrain = document.terrain
      if (!map.isStyleLoaded() || !terrain) return
      ensureBrushLayer(map)
      const source = map.getSource(BRUSH_SOURCE) as maplibregl.GeoJSONSource
      if (!BRUSH_TOOLS.has(tool)) {
        source.setData({ type: 'FeatureCollection', features: [] })
        return
      }
      const center = toLocal(terrain.grid, { lat: lngLat.lat, lng: lngLat.lng })
      const area = gridArea(document)
      const inside = Boolean(area && center.x >= area.minX && center.x <= area.maxX && center.y >= area.minY && center.y <= area.maxY)
      const ring = brushOutline(settings, center).map((p) => toLatLng(terrain.grid, p))
      source.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { inside }, geometry: { type: 'LineString', coordinates: ring.map((p) => [p.lng, p.lat]) } }] })
    }

    const pickAt = (lngLat: maplibregl.LngLat) => {
      const { document, sampler, onPick } = latest.current
      if (!sampler || !document.terrain) return
      const p = toLocal(document.terrain.grid, { lat: lngLat.lat, lng: lngLat.lng })
      onPick(Math.round(sampler.heightAt(p.x, p.y) * 100) / 100)
    }

    const onDown = (event: maplibregl.MapMouseEvent) => {
      const { enabled, tool, document, settings } = latest.current
      if (!enabled || event.originalEvent.button !== 0) return
      if (tool === 'picker' || (event.originalEvent.altKey && BRUSH_TOOLS.has(tool))) {
        pickAt(event.lngLat)
        return
      }
      if (!BRUSH_TOOLS.has(tool)) return
      const effective = event.originalEvent.shiftKey && settings.mode !== 'set'
        ? { ...settings, mode: settings.mode === 'raise' ? 'lower' as const : 'raise' as const }
        : settings
      stroke = createTerrainStroke(document, tool as BrushTool, effective)
      if (!stroke) return
      event.preventDefault()
      map.dragPan.disable()
      latest.current.onStrokeStart(stroke.workingTiles)
      pointer = { lat: event.lngLat.lat, lng: event.lngLat.lng }
      if (stroke.dab(pointer)) latest.current.onDab()
      startRepeat()
      last = document.terrain ? toLocal(document.terrain.grid, { lat: event.lngLat.lat, lng: event.lngLat.lng }) : null
    }

    const onMove = (event: maplibregl.MapMouseEvent) => {
      outline(event.lngLat)
      if (!stroke) return
      pointer = { lat: event.lngLat.lat, lng: event.lngLat.lng }
      const terrain = latest.current.document.terrain
      if (!terrain) return
      const here = toLocal(terrain.grid, { lat: event.lngLat.lat, lng: event.lngLat.lng })
      const spacing = Math.max(0.5, latest.current.settings.sizeM / 4)
      if (last && Math.hypot(here.x - last.x, here.y - last.y) < spacing) return
      last = here
      if (stroke.dab({ lat: event.lngLat.lat, lng: event.lngLat.lng })) latest.current.onDab()
    }

    const onUp = () => {
      if (!stroke) return
      stopRepeat()
      const command = stroke.finish()
      stroke = null
      last = null
      pointer = null
      map.dragPan.enable()
      // A stroke with no ground change has no command: cancel (the preview shows nothing to clean).
      if (!command) {
        latest.current.onStrokeCancel()
        return
      }
      // The command is the commit; the preview hands off to the committed tiles only when it landed.
      const result = latest.current.dispatch(command)
      if (result?.success === false) {
        latest.current.onStrokeCancel()
        return
      }
      latest.current.onStrokeEnd()
    }

    map.on('mousedown', onDown)
    map.on('mousemove', onMove)
    map.on('mouseup', onUp)
    map.on('mouseout', onUp)
    return () => {
      stopRepeat()
      map.off('mousedown', onDown)
      map.off('mousemove', onMove)
      map.off('mouseup', onUp)
      map.off('mouseout', onUp)
    }
  }, [map])
}
