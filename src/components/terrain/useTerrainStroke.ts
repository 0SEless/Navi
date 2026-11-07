'use client'

import { useEffect, useRef } from 'react'
import type maplibregl from 'maplibre-gl'
import { toLatLng, toLocal, type BrushSettings, type CampusDocument, type TerrainSampler, type TileId, type Rect } from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'
import { brushStepM, createTerrainStroke, gridArea, type BrushTool, type TerrainStroke } from '@/lib/terrain/terrain-stroke'
import { brushOutline } from '@/lib/terrain/brush-outline'
import type { TerrainTool } from './TerrainToolRail'
import { styleReady } from '@/lib/terrain/style-ready'

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
  /** After each frame's dabs: the rectangle (local metres) they touched. */
  onDab: (rect?: Rect) => void
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
    let frame: number | null = null
    let lastFrameAt = 0

    // The brush runs once per animation frame (smooth sculpting): it walks from the last brush point to the pointer
    // in dabs a quarter brush apart (moving steps), or adds one holding step when the pointer stayed, then hands the
    // touched rectangle to the preview. Mouse moves only record the pointer, so work never queues up.
    const paintFrame = (now: number) => {
      frame = null
      if (!stroke || !pointer) return
      const seconds = Math.max(0, (now - lastFrameAt) / 1000)
      lastFrameAt = now
      const { document, settings } = latest.current
      const terrain = document.terrain
      if (terrain) {
        const here = toLocal(terrain.grid, pointer)
        const from = last ?? here
        const spacing = Math.max(0.5, settings.sizeM / 4)
        const distance = Math.hypot(here.x - from.x, here.y - from.y)
        const moving = distance >= spacing
        const steps = moving ? Math.floor(distance / spacing) : 1
        const stepM = moving ? brushStepM(settings.sizeM, { moving: true }) : brushStepM(settings.sizeM, { moving: false, seconds })
        const reach = (settings.sizeM * Math.max(1, settings.aspect ?? 1)) / 2 + 2
        try {
          for (let i = 1; i <= steps && stroke; i++) {
            const at = moving ? { x: from.x + ((here.x - from.x) * i) / steps, y: from.y + ((here.y - from.y) * i) / steps } : here
            stroke.dab(toLatLng(terrain.grid, at), stepM)
          }
          if (moving) last = here
          else last = last ?? here
          if (stroke) latest.current.onDab({ minX: Math.min(from.x, here.x) - reach, minY: Math.min(from.y, here.y) - reach, maxX: Math.max(from.x, here.x) + reach, maxY: Math.max(from.y, here.y) + reach })
        } catch {
          cancelStroke()
          return
        }
      }
      if (stroke) frame = requestAnimationFrame(paintFrame)
    }
    const startRepeat = () => {
      lastFrameAt = performance.now()
      frame = requestAnimationFrame(paintFrame)
    }
    const stopRepeat = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
    }

    // Esc during a stroke, or a paint error: clean cancel with no residue (no dispatch, nothing handed off).
    const cancelStroke = () => {
      stopRepeat()
      if (!stroke) return
      stroke = null
      pointer = null
      last = null
      map.dragPan.enable()
      latest.current.onStrokeCancel()
    }
    // One guarded dab: a failing stroke or preview update cancels the stroke instead of leaking an armed repeat.
    const dabAt = (p: { lat: number; lng: number }) => {
      try {
        const { document, settings } = latest.current
        if (stroke && stroke.dab(p)) {
          const at = document.terrain ? toLocal(document.terrain.grid, p) : null
          const reach = (settings.sizeM * Math.max(1, settings.aspect ?? 1)) / 2 + 2
          latest.current.onDab(at ? { minX: at.x - reach, minY: at.y - reach, maxX: at.x + reach, maxY: at.y + reach } : undefined)
        }
      } catch {
        cancelStroke()
      }
    }

    const outline = (lngLat: maplibregl.LngLat) => {
      const { document, settings, tool } = latest.current
      const terrain = document.terrain
      if (!styleReady(map) || !terrain) return
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
      dabAt(pointer)
      if (stroke) {
        startRepeat()
        last = document.terrain ? toLocal(document.terrain.grid, { lat: event.lngLat.lat, lng: event.lngLat.lng }) : null
      }
    }

    const onMove = (event: maplibregl.MapMouseEvent) => {
      outline(event.lngLat)
      if (!stroke) return
      // Moves only record the pointer; the frame loop paints.
      pointer = { lat: event.lngLat.lat, lng: event.lngLat.lng }
    }

    const onUp = () => {
      if (!stroke) return
      stopRepeat()
      paintFrame(performance.now()) // the path still pending since the last frame
      stopRepeat()
      if (!stroke) return
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
    const onKeyDown = (event: KeyboardEvent) => {
      // Esc while a stroke is live = abandon the stroke (no dispatch): the preview cleans at once.
      if (event.key === 'Escape' && stroke) {
        event.preventDefault()
        cancelStroke()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      stopRepeat()
      window.removeEventListener('keydown', onKeyDown)
      map.off('mousedown', onDown)
      map.off('mousemove', onMove)
      map.off('mouseup', onUp)
      map.off('mouseout', onUp)
    }
  }, [map])
}
