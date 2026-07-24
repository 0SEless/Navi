import maplibregl from 'maplibre-gl'
import { roadTracePaint, roadTraceInnerPaint, roadOutlinePaint, roadFillPaint } from '@navi/core'
import { SRC, LYR } from './constants'

/**
 * Register all GeoJSON sources and render layers on the map.
 * Idempotent — returns early if sources already exist.
 */
export function addSourcesAndLayers(map: maplibregl.Map): void {
  if (map.getSource(SRC.BUILDINGS)) return

  // --- Buildings ---
  map.addSource(SRC.BUILDINGS, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: LYR.BUILDINGS_FILL,
    type: 'fill',
    source: SRC.BUILDINGS,
    paint: { 'fill-color': '#1C6BEB', 'fill-opacity': 0.08 },
  })
  map.addLayer({
    id: LYR.BUILDINGS_EXTRUSION,
    type: 'fill-extrusion',
    source: SRC.BUILDINGS,
    paint: {
      'fill-extrusion-color': ['get', 'color'],
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-opacity': 0.65,
      'fill-extrusion-base': 0,
    },
  })
  map.addLayer({
    id: LYR.BUILDINGS_OUTLINE,
    type: 'line',
    source: SRC.BUILDINGS,
    paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
  })

  // --- Edges ---
  map.addSource(SRC.EDGES, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: LYR.EDGES,
    type: 'line',
    source: SRC.EDGES,
    paint: { 'line-color': '#475569', 'line-width': 2 },
  })

  // --- Nodes ---
  map.addSource(SRC.NODES, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    promoteId: 'id',
  })
  map.addLayer({
    id: LYR.NODES,
    type: 'circle',
    source: SRC.NODES,
    paint: {
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        8,
        5,
      ],
      'circle-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#22D3EE',
        '#F59E0B',
      ],
      'circle-stroke-width': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        2.5,
        2,
      ],
      'circle-stroke-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#0E7490',
        '#1E293B',
      ],
    },
  })

  // --- Connection nodes ---
  map.addSource(SRC.NODES_CONNECTION, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    promoteId: 'id',
  })
  map.addLayer({
    id: LYR.NODES_CONNECTION,
    type: 'circle',
    source: SRC.NODES_CONNECTION,
    paint: {
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        9,
        6,
      ],
      'circle-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#67E8F9',
        '#22D3EE',
      ],
      'circle-stroke-width': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        3,
        2.5,
      ],
      'circle-stroke-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#155E75',
        '#0E7490',
      ],
    },
  })

  // --- Traces (roads) ---
  map.addSource(SRC.TRACES, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: LYR.TRACES_OUTLINE,
    type: 'line',
    source: SRC.TRACES,
    paint: roadOutlinePaint() as any,
    filter: ['==', ['get', 'type'], 'road'],
  })
  map.addLayer({
    id: LYR.TRACES_LINE,
    type: 'line',
    source: SRC.TRACES,
    paint: roadTracePaint() as any,
    filter: ['==', ['get', 'type'], 'road'],
  })
  map.addLayer({
    id: LYR.TRACES_INNER,
    type: 'line',
    source: SRC.TRACES,
    paint: roadTraceInnerPaint() as any,
    filter: ['!=', ['get', 'type'], 'road'],
  })

  // --- Boundary ---
  map.addSource(SRC.BOUNDARY, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: LYR.BOUNDARY_FILL,
    type: 'fill',
    source: SRC.BOUNDARY,
    paint: {
      'fill-color': '#F59E0B',
      'fill-opacity': 0.08,
    },
  })
  map.addLayer({
    id: LYR.BOUNDARY_OUTLINE,
    type: 'line',
    source: SRC.BOUNDARY,
    paint: {
      'line-color': '#F59E0B',
      'line-width': 2,
      'line-dasharray': [4, 4],
      'line-opacity': 0.6,
    },
  })

  // --- Drawing (ephemeral) ---
  map.addSource(SRC.DRAWING, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: LYR.DRAWING_LINE,
    type: 'line',
    source: SRC.DRAWING,
    paint: {
      'line-color': '#06B6D4',
      'line-width': 3,
      'line-dasharray': [4, 4],
      'line-opacity': 0.6,
    },
  })
  map.addLayer({
    id: LYR.DRAWING_POINTS,
    type: 'circle',
    source: SRC.DRAWING,
    paint: {
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        9,
        6,
      ],
      'circle-color': '#06B6D4',
      'circle-opacity': 0.8,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
    },
  })
}
