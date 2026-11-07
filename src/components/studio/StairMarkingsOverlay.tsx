'use client'

// Stair route links (2026-11-07): outdoor stairs and ramps drawn flat in the map editor — outline (dashed: not
// connected, solid: connected, warning colour: out of step), a line per step and an uphill arrow. Clicking one opens
// its StairPanel; while connecting, a click on a route line picks the bottom route.
import { useEffect, useMemo, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import {
  routeCandidate,
  stairMarking,
  stairRouteOf,
  structureSampler,
  type CampusDocument,
  type CoordinateTransformer,
  type StairEndRoute,
} from '@navi/core'
import type { Command } from '@navi/editor'
import { StairPanel, stairProblem } from './StairPanel'
import { exposeTerrainMapForProbe } from '@/studio-v2/client/test-hooks'
import { styleReady } from '@/lib/terrain/style-ready'

const SOURCE = 'stair-markings'
const HIT = 'stair-markings-hit'
const OUTLINE = 'stair-markings-outline'
const OUTLINE_OPEN = 'stair-markings-outline-open'
const LINES = 'stair-markings-lines'
const COLOR = '#475569'
const WARNING = '#d97706'
/** How far from a route line a click still picks it while connecting. */
const PICK_M = 6

type State = 'open' | 'connected' | 'warning'

function markingData(document: CampusDocument): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const structure of document.structures ?? []) {
    const marking = stairMarking(document, structure)
    if (!marking) continue
    const state: State = stairRouteOf(document, structure.id) ? (stairProblem(document, structure.id) ? 'warning' : 'connected') : 'open'
    const props = { id: structure.id, state }
    const ring = marking.outline.map((p) => [p.lng, p.lat])
    features.push({ type: 'Feature', properties: { ...props, part: 'area' }, geometry: { type: 'Polygon', coordinates: [ring] } })
    features.push({ type: 'Feature', properties: { ...props, part: 'outline' }, geometry: { type: 'LineString', coordinates: ring } })
    for (const [a, b] of marking.steps) {
      features.push({ type: 'Feature', properties: { ...props, part: 'step' }, geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] } })
    }
    const [from, to] = marking.arrow
    features.push({ type: 'Feature', properties: { ...props, part: 'arrow' }, geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [to.lng, to.lat]] } })
    features.push({ type: 'Feature', properties: { ...props, part: 'arrow' }, geometry: { type: 'LineString', coordinates: marking.arrowHead.map((p) => [p.lng, p.lat]) } })
  }
  return { type: 'FeatureCollection', features }
}

function ensureLayers(map: maplibregl.Map): void {
  if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  const color: maplibregl.ExpressionSpecification = ['case', ['==', ['get', 'state'], 'warning'], WARNING, COLOR]
  if (!map.getLayer(HIT)) map.addLayer({ id: HIT, type: 'fill', source: SOURCE, filter: ['==', ['get', 'part'], 'area'], paint: { 'fill-color': color, 'fill-opacity': 0.12 } })
  if (!map.getLayer(OUTLINE)) {
    map.addLayer({ id: OUTLINE, type: 'line', source: SOURCE, filter: ['all', ['==', ['get', 'part'], 'outline'], ['!=', ['get', 'state'], 'open']], paint: { 'line-color': color, 'line-width': 2 } })
  }
  if (!map.getLayer(OUTLINE_OPEN)) {
    map.addLayer({ id: OUTLINE_OPEN, type: 'line', source: SOURCE, filter: ['all', ['==', ['get', 'part'], 'outline'], ['==', ['get', 'state'], 'open']], paint: { 'line-color': color, 'line-width': 2, 'line-dasharray': [2, 1.5] } })
  }
  if (!map.getLayer(LINES)) {
    map.addLayer({ id: LINES, type: 'line', source: SOURCE, filter: ['in', ['get', 'part'], ['literal', ['step', 'arrow']]], paint: { 'line-color': color, 'line-width': ['case', ['==', ['get', 'part'], 'arrow'], 2.5, 1] } })
  }
}

export function StairMarkingsOverlay({ map, document, version, mapId, transformer, ensureZone, executeBatch }: {
  map: maplibregl.Map
  document: CampusDocument
  /** The document store's version: commands change the document in place. */
  version: number
  mapId: string
  transformer?: CoordinateTransformer
  ensureZone(zones: string[]): Promise<boolean>
  executeBatch(commands: Command[]): { success: boolean; error?: string }
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [picked, setPicked] = useState<StairEndRoute | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => markingData(document), [document, version])
  const latest = useRef({ document, choosing })
  latest.current = { document, choosing }

  // Browser probes (test builds only) reach the map editor's map as __naviTerrainMaps.studio.
  useEffect(() => exposeTerrainMapForProbe('studio', map), [map])

  useEffect(() => {
    const draw = () => {
      // Not map.isStyleLoaded(): it stays false while outside map tiles load (or fail).
      if (!styleReady(map)) return
      ensureLayers(map)
      ;(map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(data)
    }
    draw()
    map.on('style.load', draw)
    map.on('styledata', draw)
    return () => {
      map.off('style.load', draw)
      map.off('styledata', draw)
    }
  }, [map, data])

  useEffect(() => {
    const onClick = (event: maplibregl.MapMouseEvent) => {
      const hit = map.getLayer(HIT) ? map.queryRenderedFeatures(event.point, { layers: [HIT] }) : []
      const id = hit[0]?.properties?.id as string | undefined
      if (id && !latest.current.choosing) {
        setSelected(id)
        setPicked(null)
        return
      }
      if (!latest.current.choosing) return
      // Connecting: the nearest route line within a few metres of the click becomes the bottom route.
      const doc = latest.current.document
      const grid = structureSampler(doc)?.grid
      if (!grid) return
      const at = { lat: event.lngLat.lat, lng: event.lngLat.lng }
      let best: { candidate: StairEndRoute; distance: number } | null = null
      for (const road of doc.roads) {
        if (road.routing?.structureId) continue
        const found = routeCandidate(doc, grid, road, at)
        if (found && found.distance <= PICK_M && (!best || found.distance < best.distance)) best = found
      }
      if (best) setPicked(best.candidate)
    }
    const enter = () => { map.getCanvas().style.cursor = 'pointer' }
    const leave = () => { map.getCanvas().style.cursor = '' }
    map.on('click', onClick)
    map.on('mouseenter', HIT, enter)
    map.on('mouseleave', HIT, leave)
    return () => {
      map.off('click', onClick)
      map.off('mouseenter', HIT, enter)
      map.off('mouseleave', HIT, leave)
    }
  }, [map])

  const toWorld = useMemo(() => (buildingId: string, level: number, local: { x: number; y: number }) => transformer?.floorLocalToWorld(local, buildingId, level) ?? null, [transformer])
  if (!selected) return null
  return (
    <StairPanel
      document={document} structureId={selected} mapId={mapId} toWorld={toWorld} pickedBottom={picked}
      onChoosingChange={(on) => { setChoosing(on); if (!on) setPicked(null) }}
      ensureZone={ensureZone} executeBatch={executeBatch}
      onClose={() => { setSelected(null); setChoosing(false); setPicked(null) }}
    />
  )
}
