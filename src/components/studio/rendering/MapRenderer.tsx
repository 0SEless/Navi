'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { useGraphStore } from '@/store/graph-store'
import { useStudioStore } from '@/store/studio-store'
import { useEditor, useDocumentVersion, buildingsToGeoJSON, roadsToTracesGeoJSON } from '@navi/editor'
import type { Graph } from '@/engine/graph'
import type { NavNode, NavEdge } from '@/types/nav-types'
import type { LayerVisibility } from '@/types/studio-types'
import type { CampusDocument } from '@navi/core'
import { SRC, HIDDEN_NODE_TYPES, LYR } from './constants'
import { addSourcesAndLayers } from './layers'
import {
  buildNodeGeo,
  buildConnectionNodeGeo,
  buildEdgeGeo,
} from './geojson'

// ── Base map styles ───────────────────────────────────────────────

const EMPTY_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background' as const,
      paint: { 'background-color': '#1a1a2e' },
    },
  ],
}

const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' as const }],
}

const SATELLITE_STYLE = {
  version: 8 as const,
  sources: {
    satellite: {
      type: 'raster' as const,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution:
        '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    },
  },
  layers: [{ id: 'satellite', type: 'raster' as const, source: 'satellite' as const }],
}

/**
 * Returns the initial map style used by StudioCanvas for map construction.
 * On the client, OSM tiles are shown immediately; on the server a fallback is used.
 */
export function getInitialMapStyle() {
  if (typeof window !== 'undefined') return OSM_STYLE
  return EMPTY_STYLE
}

// ── GeoJSON pipeline ──────────────────────────────────────────────

function renderAll(map: maplibregl.Map, graph: Graph, document: CampusDocument, activeFloor: number) {
  addSourcesAndLayers(map)

  const filteredNodes = graph.nodes.filter((n: NavNode) => n.floor === activeFloor)
  const filteredEdges = graph.edges.filter((e: NavEdge) => {
    const from = graph.getNode(e.from)
    const to = graph.getNode(e.to)
    return from?.floor === activeFloor && to?.floor === activeFloor
  })

  const visibleNodes = filteredNodes.filter((n) => !HIDDEN_NODE_TYPES.has(n.type))
  const connNodes = visibleNodes.filter((n) => n.metadata?.connectionNode === true)
  const connNodeIds = new Set(connNodes.map((n) => n.id))
  const regNodes = visibleNodes.filter((n) => !connNodeIds.has(n.id))
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id))
  const visibleEdges = filteredEdges.filter(
    (e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to),
  )

  const buildingGeo = buildingsToGeoJSON(document.buildings)
  const nodeGeo = buildNodeGeo(regNodes)
  const connNodeGeo = buildConnectionNodeGeo(connNodes)
  const edgeGeo = buildEdgeGeo(visibleEdges, visibleNodes)
  const tracesGeo = roadsToTracesGeoJSON(document.roads)

  try {
    const buildingSrc = map.getSource(SRC.BUILDINGS) as maplibregl.GeoJSONSource | undefined
    buildingSrc?.setData(buildingGeo)
    const nodeSrc = map.getSource(SRC.NODES) as maplibregl.GeoJSONSource | undefined
    nodeSrc?.setData(nodeGeo)
    const connNodeSrc = map.getSource(SRC.NODES_CONNECTION) as maplibregl.GeoJSONSource | undefined
    connNodeSrc?.setData(connNodeGeo)
    const edgeSrc = map.getSource(SRC.EDGES) as maplibregl.GeoJSONSource | undefined
    edgeSrc?.setData(edgeGeo)
    const tracesSrc = map.getSource(SRC.TRACES) as maplibregl.GeoJSONSource | undefined
    tracesSrc?.setData(tracesGeo)
  } catch {
    // Gracefully handle cases where map has been removed or sources aren't ready
  }
}

// ── Layer visibility ──────────────────────────────────────────────

function setLayerVisibility(map: maplibregl.Map, layers: LayerVisibility) {
  const setVis = (layerId: string, visible: boolean) => {
    try {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
    } catch {
      /* layer may not exist yet */
    }
  }
  setVis(LYR.NODES, layers.nodes)
  setVis(LYR.NODES_CONNECTION, layers.nodes)
  setVis(LYR.EDGES, layers.edges)
  setVis(LYR.BUILDINGS_FILL, layers.buildings)
  setVis(LYR.BUILDINGS_EXTRUSION, layers.buildings)
  setVis(LYR.BUILDINGS_OUTLINE, layers.buildings)
}

// ── Component ─────────────────────────────────────────────────────

export interface MapRendererProps {
  map: maplibregl.Map
}

/**
 * Owns all rendering concerns on the MapLibre map instance:
 *  - GeoJSON source/layer creation & data sync
 *  - Layer visibility toggles (nodes, edges, buildings)
 *  - Base style switching (OSM ↔ Satellite)
 *  - Vertex editing layer visibility
 */
export function MapRenderer({ map }: MapRendererProps) {
  const { document } = useEditor()
  const graph = useGraphStore((s) => s.graph)
  const docVersion = useDocumentVersion()
  const activeFloor = useStudioStore((s) => s.activeFloor)
  const layers = useStudioStore((s) => s.layers)
  const isVertexEditing = useStudioStore((s) => s.isVertexEditing)

  const graphRef = useRef(graph)
  graphRef.current = graph
  const docRef = useRef(document)
  docRef.current = document
  const floorRef = useRef(activeFloor)
  floorRef.current = activeFloor
  const layersRef = useRef(layers)
  layersRef.current = layers

  const preEditLayerVisRef = useRef<{ nodes: boolean }>({ nodes: true })

  // ── Primary render: push GeoJSON data to sources ──
  useEffect(() => {
    renderAll(map, graph, document, activeFloor)
  }, [map, graph, document, activeFloor, docVersion])

  // ── Style reload handler ──
  useEffect(() => {
    const onStyleLoad = () => {
      renderAll(map, graphRef.current, docRef.current, floorRef.current)
      setLayerVisibility(map, layersRef.current)
    }
    map.on('style.load', onStyleLoad)
    return () => {
      map.off('style.load', onStyleLoad)
    }
  }, [map])

  // ── Layer visibility toggles ──
  useEffect(() => {
    if (!map.getStyle()) return
    setLayerVisibility(map, layers)
  }, [layers, map])

  // ── Base style switching (satellite toggle) ──
  useEffect(() => {
    const currentStyle = map.getStyle()
    const isSatellite = currentStyle?.sources?.satellite != null
    const wantsSatellite = layers.satellite
    if (wantsSatellite === isSatellite) return
    const targetStyle = wantsSatellite ? SATELLITE_STYLE : OSM_STYLE
    map.setStyle(targetStyle)
  }, [layers.satellite, map])

  // ── Vertex editing layer visibility ──
  useEffect(() => {
    if (!map.getStyle()) return
    const setVis = (layerId: string, visible: boolean) => {
      try {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
      } catch {
        /* ok */
      }
    }
    if (isVertexEditing) {
      preEditLayerVisRef.current = { nodes: layers.nodes }
      setVis(LYR.NODES, true)
      setVis(LYR.NODES_CONNECTION, true)
    } else {
      setVis(LYR.NODES, preEditLayerVisRef.current.nodes)
      setVis(LYR.NODES_CONNECTION, preEditLayerVisRef.current.nodes)
    }
  }, [isVertexEditing, map])

  return null
}
