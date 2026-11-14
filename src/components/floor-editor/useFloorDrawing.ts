'use client'

import { useCallback, useRef, useEffect, useReducer, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { useEditor, findBuilding, genId, snapPoint } from '@navi/editor'
import type { SnapPoint2D, SnapConfig } from '@navi/editor'
import type { LatLng, ComponentType } from '@/types/nav-types'
import type { StudioTool } from '@/types/studio-types'
import { computeHallwayPolygon } from '@/types/hallway-types'
import { StairDefinition, ElevatorDefinition } from '@/types/parametric-types'
import { drawReducer } from './draw-reducer'
import { resolveEntranceFinishAccess, routeStartError, snapRouteStartToEntrance } from './entrance-route-authoring'
import type { EntranceRouteAnchor } from './entrance-route-authoring'
import { isPolygonAuthoringTool } from './semantic-room-interaction'
import { localRectangleFromDrag, normalizeLocalRectangle } from '@navi/core'
import type { EntranceAccess, Wall } from '@navi/core'
import { findPlacementWall, projectWallDoorRectangle, projectWallWindow } from '@navi/editor/src/geometry/door-placement'
import { buildFloorRectangleCommand } from './floor-rectangle-authoring'
import type { FloorRectangleTool } from './floor-rectangle-authoring'
import { resolveRouteTargetHit, ROUTE_TARGET_LAYER_IDS } from './route-target-authoring'

/** Two clicks closer than this are a browser-reported multi-click repeat, not a new vertex. */
export const DUPLICATE_CLICK_EPSILON_METERS = 0.25

function sameClickedSpot(a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean {
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot((a.lat - b.lat) * metersPerDegLat, (a.lng - b.lng) * metersPerDegLng) <= DUPLICATE_CLICK_EPSILON_METERS
}

/** Wall drawing state — simple two-click line with snapping */
interface WallDrawState {
  start: LatLng | null
  /** Snapped building-local coordinate of the start point (for snap continuity) */
  startLocal: SnapPoint2D | null
}

/** Door/window drawing state — two-click placement on wall */
interface DoorDrawState {
  start: LatLng | null
  startLocal: SnapPoint2D | null
  wallId: string | null
  startOffset: number | null
  host?: Wall
}

/** Snap modes for wall drawing */
export type SnapMode = 'architectural' | 'trace' | 'free'

/** Snap configurations for each mode */
export const SNAP_CONFIGS: Record<SnapMode, SnapConfig> = {
  architectural: {
    gridSize: 1,
    endpointSnap: 0.5,
    gridSnap: 0.2,
    orthogonalSnap: true,
    angle45Snap: true,
  },
  trace: {
    gridSize: 1,
    endpointSnap: 0.5,
    gridSnap: 0,
    orthogonalSnap: false,
    angle45Snap: false,
  },
  free: {
    gridSize: 1,
    endpointSnap: 0,
    gridSnap: 0,
    orthogonalSnap: false,
    angle45Snap: false,
  },
}

export const DEFAULT_SNAP_MODE: SnapMode = 'trace'

const DRAW_SRC = 'floor-draw-preview'

function isDrawingMapReady(map: maplibregl.Map | null | undefined, parentReady?: boolean): boolean {
  if (!map || parentReady === false) return false
  // MapLibre exposes isStyleLoaded(). The parent Canvas readiness flag is
  // necessary for the shared lifecycle, but it must not override a style that
  // is still loading (or a map instance that has already been removed).
  if (typeof map.isStyleLoaded === 'function') {
    try { return Boolean(map.isStyleLoaded()) }
    catch { return false }
  }
  // Keep the drawing hook compatible with lightweight map doubles that do not
  // expose isStyleLoaded().
  return parentReady !== undefined ? parentReady : true
}

function addDrawLayers(map: maplibregl.Map | null | undefined, parentReady?: boolean): boolean {
  if (!map || !isDrawingMapReady(map, parentReady)) return false
  try {
    if (map.getSource(DRAW_SRC)) return true
  } catch {
    // A MapLibre instance can be removed between the readiness check and this
    // effect. Wait for the next lifecycle transition instead of crashing the
    // Floor Editor error boundary.
    return false
  }
  map.addSource(DRAW_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  // preview line (trace)
  map.addLayer({ id: 'floor-draw-line', type: 'line', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'line'], paint: { 'line-color': '#F59E0B', 'line-width': 3, 'line-opacity': 0.7, 'line-dasharray': [4, 3] } })
  // wall preview line (thicker, distinct color)
  map.addLayer({ id: 'floor-draw-wall-line', type: 'line', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'wall'], paint: { 'line-color': '#EF4444', 'line-width': 4, 'line-opacity': 0.8 } })
  // preview polygon fill + outline (room)
  map.addLayer({ id: 'floor-draw-polygon-fill', type: 'fill', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'polygon'], paint: { 'fill-color': '#10B981', 'fill-opacity': 0.15 } })
  map.addLayer({ id: 'floor-draw-polygon-outline', type: 'line', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'polygon'], paint: { 'line-color': '#10B981', 'line-width': 2, 'line-dasharray': [4, 3] } })
  // preview width buffer (hallway)
  map.addLayer({ id: 'floor-draw-buffer-fill', type: 'fill', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'buffer'], paint: { 'fill-color': '#10B981', 'fill-opacity': 0.15 } })
  map.addLayer({ id: 'floor-draw-buffer-outline', type: 'line', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'buffer'], paint: { 'line-color': '#10B981', 'line-width': 2, 'line-dasharray': [4, 3] } })
  // placement vertices
  const zoomV = ['interpolate', ['linear'], ['zoom'], 15, 3, 20, 6]
  const zoomP = ['interpolate', ['linear'], ['zoom'], 15, 4, 20, 8]
  map.addLayer({ id: 'floor-draw-vertices', type: 'circle', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'vertex'], paint: { 'circle-radius': zoomV as unknown as maplibregl.ExpressionSpecification, 'circle-color': '#F59E0B', 'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF' } })
  // placed item icons (door, stairs, elevator, asset)
  map.addLayer({ id: 'floor-draw-placed', type: 'circle', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'placed'], paint: { 'circle-radius': zoomP as unknown as maplibregl.ExpressionSpecification, 'circle-color': '#8B5CF6', 'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF' } })
  map.addLayer({
    id: 'floor-draw-placed-label', type: 'symbol', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'placed'],
    layout: { 'text-field': ['get', 'label'], 'text-size': 10, 'text-offset': [0, -1.5], 'text-anchor': 'bottom' },
    paint: { 'text-color': '#1E293B', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1 },
  })
  return true
}

function queryRenderedFeatures(
  map: maplibregl.Map | null | undefined,
  point: maplibregl.Point,
  layerIds: string[],
): maplibregl.MapGeoJSONFeature[] {
  if (!map) return []

  const availableLayerIds = typeof map.getLayer === 'function'
    ? layerIds.filter((layerId) => {
      try { return Boolean(map.getLayer(layerId)) }
      catch { return false }
    })
    : layerIds

  if (availableLayerIds.length === 0) return []
  try {
    return map.queryRenderedFeatures(point, { layers: availableLayerIds })
  } catch {
    // A style transition can remove a layer between getLayer() and the query.
    return []
  }
}

function updatePreview(map: maplibregl.Map, features: GeoJSON.Feature[], parentReady?: boolean) {
  if (!isDrawingMapReady(map, parentReady)) return
  const src = map.getSource(DRAW_SRC) as maplibregl.GeoJSONSource
  if (src) src.setData({ type: 'FeatureCollection', features })
}

function clearPreview(map: maplibregl.Map, parentReady?: boolean) {
  if (!isDrawingMapReady(map, parentReady)) return
  try {
    const src = map.getSource(DRAW_SRC) as maplibregl.GeoJSONSource
    if (src) src.setData({ type: 'FeatureCollection', features: [] })
  } catch { /* map may have been removed */ }
}

function pointsToLine(points: LatLng[]): GeoJSON.Feature {
  return {
    type: 'Feature', properties: { type: 'line' },
    geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat] as [number, number]) },
  }
}

function pointsToPolygon(points: LatLng[]): GeoJSON.Feature {
  return {
    type: 'Feature', properties: { type: 'polygon' },
    geometry: { type: 'Polygon', coordinates: [[...points.map((p) => [p.lng, p.lat] as [number, number]), [points[0].lng, points[0].lat] as [number, number]]] },
  }
}

function pointsToVertices(points: LatLng[]): GeoJSON.Feature[] {
  return points.map((p, i) => ({
    type: 'Feature' as const, properties: { type: 'vertex', index: i },
    geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] as [number, number] },
  }))
}

/** Collect wall bodies so new endpoints can form exact T-junctions. */
function collectWallSegments(doc: any, buildingId: string, floorId: string): WallSegment[] {
  const bld = findBuilding(doc, buildingId)
  const fl = bld?.floors?.find((f: any) => f.id === floorId)
  if (!fl?.walls) return []
  return fl.walls.map((wall: WallSegment) => ({
    id: wall.id,
    start: { x: wall.start.x, y: wall.start.y },
    end: { x: wall.end.x, y: wall.end.y },
  }))
}

interface RectangleDrawState {
  tool: FloorRectangleTool
  start: SnapPoint2D
  current: SnapPoint2D
  wall?: Wall
  floorId?: string
}

function rectangleToolLabel(tool: FloorRectangleTool): string {
  return tool === 'door' ? 'Door' : tool === 'stairs' ? 'Stair' : 'Elevator'
}

function rectangleReadyMessage(tool: StudioTool): string | null {
  if (tool === 'window') return 'Window: click the start and end of the span on one wall.'
  if (tool === 'door') return 'Door: start on a wall. Drag along it for width and away from it for depth.'
  if (tool !== 'stairs' && tool !== 'elevator') return null
  return `${rectangleToolLabel(tool)}: click and drag to draw a rectangle.`
}

export function computeWidthBuffer(centerline: LatLng[], totalWidth: number): LatLng[] {
  return computeHallwayPolygon(centerline, totalWidth)
}

function placedItem(position: LatLng, label: string): GeoJSON.Feature {
  return {
    type: 'Feature', properties: { type: 'placed', label },
    geometry: { type: 'Point', coordinates: [position.lng, position.lat] },
  }
}

/** Wall segment in building-local coordinates for projection */
export interface WallSegment {
  id: string
  start: { x: number; y: number }
  end: { x: number; y: number }
}

/** Apply the Wall Tool's endpoint > wall-body > mode-specific snap contract. */
export function snapWallAuthoringPoint(
  point: SnapPoint2D,
  config: SnapConfig,
  walls: readonly WallSegment[],
  lastPoint?: SnapPoint2D,
) {
  const endpoints = walls.flatMap((wall) => [wall.start, wall.end])
  return snapPoint(point, config, endpoints, lastPoint, walls)
}

const DOOR_OPENING_THRESHOLD = 2.0 // meters — max distance from wall to place a door/window

/**
 * Find the nearest wall segment to a building-local point within the threshold.
 * Returns wallId, offset along wall, and perpendicular distance, or null.
 */
export function findNearestWall(
  point: { x: number; y: number },
  walls: WallSegment[],
  threshold: number = DOOR_OPENING_THRESHOLD,
): { wallId: string; offset: number; distance: number } | null {
  let best: { wallId: string; offset: number; distance: number } | null = null
  for (const wall of walls) {
    const dx = wall.end.x - wall.start.x
    const dy = wall.end.y - wall.start.y
    const lenSq = dx * dx + dy * dy
    if (lenSq < 1e-10) continue
    // Project point onto infinite line
    const t = ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lenSq
    const clampedT = Math.max(0, Math.min(1, t))
    const projX = wall.start.x + clampedT * dx
    const projY = wall.start.y + clampedT * dy
    const dist = Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2)
    if (dist <= threshold) {
      const offset = clampedT * Math.sqrt(lenSq)
      if (!best || dist < best.distance) {
        best = { wallId: wall.id, offset, distance: dist }
      }
    }
  }
  return best
}

/**
 * Build a GeoJSON feature for a door opening on a wall.
 * Door = gap (perpendicular segment across the wall) rendered as a thick line.
 */
function openingDoorFeature(
  openingPosition: { lng: number; lat: number },
  wallStart: { lng: number; lat: number },
  wallEnd: { lng: number; lat: number },
  openingId: string,
): GeoJSON.Feature {
  // Compute perpendicular unit vector to wall
  const dx = wallEnd.lng - wallStart.lng
  const dy = wallEnd.lat - wallStart.lat
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-10) {
    return {
      type: 'Feature', properties: { type: 'door', id: openingId },
      geometry: { type: 'Point', coordinates: [openingPosition.lng, openingPosition.lat] },
    }
  }
  const halfWidth = 0.25 // visual gap half-width in degrees (~2m at 18 zoom)
  const nx = (-dy / len) * halfWidth
  const ny = (dx / len) * halfWidth
  return {
    type: 'Feature', properties: { type: 'door', id: openingId },
    geometry: {
      type: 'LineString',
      coordinates: [
        [openingPosition.lng + nx, openingPosition.lat + ny],
        [openingPosition.lng - nx, openingPosition.lat - ny],
      ],
    },
  }
}

/**
 * Build a GeoJSON feature for a window opening on a wall.
 * Window = short perpendicular segment rendered with contrasting color.
 */
function openingWindowFeature(
  openingPosition: { lng: number; lat: number },
  wallStart: { lng: number; lat: number },
  wallEnd: { lng: number; lat: number },
  openingId: string,
): GeoJSON.Feature {
  const dx = wallEnd.lng - wallStart.lng
  const dy = wallEnd.lat - wallStart.lat
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-10) {
    return {
      type: 'Feature', properties: { type: 'window', id: openingId },
      geometry: { type: 'Point', coordinates: [openingPosition.lng, openingPosition.lat] },
    }
  }
  const halfWidth = 0.18 // window visual half-width
  const nx = (-dy / len) * halfWidth
  const ny = (dx / len) * halfWidth
  return {
    type: 'Feature', properties: { type: 'window', id: openingId },
    geometry: {
      type: 'LineString',
      coordinates: [
        [openingPosition.lng + nx, openingPosition.lat + ny],
        [openingPosition.lng - nx, openingPosition.lat - ny],
      ],
    },
  }
}

type RoutePointInput = { x: number; y: number; entranceId?: string; existingNodeId?: string; junction?: { edgeId: string; position: { x: number; y: number } } }

/**
 * Result of committing pending Route points. `rejected` carries the command
 * error so callers surface it (via onRouteStartRejected) instead of silently
 * dropping the authoring; `skipped` means the commit did not apply to the tool.
 */
type RouteCommitOutcome =
  | { status: 'ok'; data?: Record<string, unknown> }
  | { status: 'rejected'; error: string }
  | { status: 'skipped' }

export interface EntranceAccessRequiredRequest {
  entranceId: string
  buildingId: string
  floorId: string
  indoorRouteNodeId: string
  restore: {
    buildingId: string
    floorId: string
    hadNetwork: boolean
    previousNetwork?: unknown
    /** Pre-assignment snapshot for the pending Entrance anchor, when this finish also assigned it. */
    anchorAccessRestore?: { entranceId: string; previousEntranceAccess: EntranceAccess[] | undefined }
  }
}

interface UseFloorDrawingOptions {
  map: maplibregl.Map | null
  mapReady?: boolean
  buildingId: string
  campusId: string
  floor: number
  tool: StudioTool
  readOnly?: boolean
  onSelect?: (id: string | null) => void
  editEngine?: { begin: (op: any) => void; doCommit: () => { committed: boolean } }
  snapMode?: SnapMode
  onSnapModeChange?: (mode: SnapMode) => void
  pendingRouteAnchor?: EntranceRouteAnchor
  onRouteStartRejected?: (reason: string) => void
  onRouteAccessAssigned?: (access: { entranceId: string; outdoorNodeId: string; indoorRouteNodeId: string }) => void
  onEntranceAccessRequired?: (request: EntranceAccessRequiredRequest) => void
}

export function useFloorDrawing({ map, mapReady, buildingId, campusId, floor, tool, readOnly = false, onSelect, editEngine, snapMode: externalSnapMode, onSnapModeChange, pendingRouteAnchor, onRouteStartRejected, onRouteAccessAssigned, onEntranceAccessRequired }: UseFloorDrawingOptions) {
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly
  const editor = useEditor()
  const doc = editor.document
  const transformer = editor.transformer
  const dispatcher = editor.services.get('dispatcher')!

  const [drawState, dispatch] = useReducer(drawReducer, { drawMode: 'idle', pendingPoints: [], pendingPolygon: [] })
  const [wallDraw, setWallDraw] = useState<WallDrawState>({ start: null, startLocal: null })
  const wallDrawRef = useRef(wallDraw)
  useEffect(() => { wallDrawRef.current = wallDraw }, [wallDraw])
  const toolRef = useRef(tool)
  useEffect(() => { toolRef.current = tool }, [tool])
  const routeStartedRef = useRef(false)
  const routeStartTargetRef = useRef<RoutePointInput | null>(null)
  const [routeConnectionPrompt, setRouteConnectionPrompt] = useState<{ edgeId: string; position: LatLng } | null>(null)
  const seededRouteAnchorRef = useRef<EntranceRouteAnchor | null>(null)
  const lastClickPositionRef = useRef<{ lat: number; lng: number } | null>(null)

  // Snap mode state for wall drawing
  const [internalSnapMode, setInternalSnapMode] = useState<SnapMode>(DEFAULT_SNAP_MODE)
  const snapMode = externalSnapMode ?? internalSnapMode
  const setSnapMode = onSnapModeChange ?? setInternalSnapMode
  const snapModeRef = useRef(snapMode)
  useEffect(() => { snapModeRef.current = snapMode }, [snapMode])

  // Door/window drawing state: two-click placement
  const [doorDraw, setDoorDraw] = useState<DoorDrawState>({ start: null, startLocal: null, wallId: null, startOffset: null })
  const doorDrawRef = useRef(doorDraw)
  useEffect(() => { doorDrawRef.current = doorDraw }, [doorDraw])
  const [rectangleDraw, setRectangleDraw] = useState<RectangleDrawState | null>(null)
  const rectangleDrawRef = useRef(rectangleDraw)
  const [rectangleMessage, setRectangleMessage] = useState<string | null>(() => rectangleReadyMessage(tool))
  const updateRectangleDraw = useCallback((next: RectangleDrawState | null) => {
    rectangleDrawRef.current = next
    setRectangleDraw(next)
  }, [])

  // Initialize layers
  useEffect(() => {
    if (!map || mapReady === false) return
    let active = true
    let initialized = false
    const initialize = () => {
      if (!active || initialized || !isDrawingMapReady(map, mapReady)) return
      initialized = addDrawLayers(map, mapReady)
    }

    initialize()
    if (!initialized) {
      // The parent Canvas may have consumed MapLibre's one-shot load event
      // before this hook mounts. idle/styledata cover that late-subscription
      // case while still waiting for the actual style readiness check above.
      map.once('load', initialize)
      map.on('idle', initialize)
      map.on('styledata', initialize)
    }

    return () => {
      active = false
      try { map.off('load', initialize) } catch { /* map may have been removed */ }
      try { map.off('idle', initialize) } catch { /* map may have been removed */ }
      try { map.off('styledata', initialize) } catch { /* map may have been removed */ }
      clearPreview(map, mapReady)
    }
  }, [map, mapReady])

  // Drop every active gesture when its editing scope or permission changes.
  useEffect(() => {
    dispatch({ type: 'RESET' })
    routeStartedRef.current = false
    routeStartTargetRef.current = null
    seededRouteAnchorRef.current = null
    setRouteConnectionPrompt(null)
    setWallDraw({ start: null, startLocal: null })
    doorDrawRef.current = { start: null, startLocal: null, wallId: null, startOffset: null }
    setDoorDraw(doorDrawRef.current)
    updateRectangleDraw(null)
    setRectangleMessage(rectangleReadyMessage(tool))
    if (map && mapReady) clearPreview(map)
    if (map) map.dragPan?.enable()
  }, [tool, floor, buildingId, map, mapReady, readOnly, updateRectangleDraw])

  // Route authoring parity with the Road tool: every press must stay a click.
  // MapLibre converts presses that move past clickTolerance into pans and drops
  // the click event, which reads as "my corner click did nothing".
  useEffect(() => {
    if (!map || !mapReady) return
    if (readOnly || tool !== 'hallway') return
    map.dragPan?.disable()
    return () => {
      map.dragPan?.enable()
    }
  }, [map, mapReady, tool, readOnly])

  // A confirmed outdoor target fixes the first indoor Route vertex to the
  // exact Entrance position. The author only needs to click the next point;
  // this avoids a fragile pixel-perfect hit on the Entrance marker while
  // preserving the existing Route creation and access-assignment transaction.
  useEffect(() => {
    if (readOnly || tool !== 'hallway' || !pendingRouteAnchor || drawState.pendingPolygon.length > 0) return
    if (seededRouteAnchorRef.current === pendingRouteAnchor) return
    seededRouteAnchorRef.current = pendingRouteAnchor
    dispatch({ type: 'ADD_POLYGON_POINT', point: { ...pendingRouteAnchor.position } })
    routeStartedRef.current = true
  }, [drawState.pendingPolygon.length, pendingRouteAnchor, tool, readOnly])

  // Update preview
  useEffect(() => {
    if (!map || !isDrawingMapReady(map, mapReady)) return
    const features: GeoJSON.Feature[] = []
    if (drawState.drawMode === 'placing-points' && drawState.pendingPoints.length > 0) {
      features.push(pointsToLine(drawState.pendingPoints), ...pointsToVertices(drawState.pendingPoints))
    }
    if (drawState.drawMode === 'placing-polygon' && drawState.pendingPolygon.length > 0) {
      if (toolRef.current === 'hallway') {
        // The visible hallway-compatible tool is now Route. It authors a
        // centerline graph, never a buffered hallway polygon.
        features.push(pointsToLine(drawState.pendingPolygon), ...pointsToVertices(drawState.pendingPolygon))
      } else {
        features.push(pointsToPolygon(drawState.pendingPolygon), ...pointsToVertices(drawState.pendingPolygon))
      }
    }
    // Wall preview: show start vertex while waiting for end click
    if (toolRef.current === 'wall' && wallDrawRef.current.start) {
      const ws = wallDrawRef.current.start
      features.push({
        type: 'Feature', properties: { type: 'vertex', index: 0 },
        geometry: { type: 'Point', coordinates: [ws.lng, ws.lat] },
      })
    }
    // Window preview: show the first wall position while waiting for the end click.
    // Door now uses the shared rectangle gesture below.
    if (toolRef.current === 'window' && doorDrawRef.current.start) {
      const ds = doorDrawRef.current.start
      features.push({
        type: 'Feature', properties: { type: 'vertex', index: 0 },
        geometry: { type: 'Point', coordinates: [ds.lng, ds.lat] },
      })
    }
    if (rectangleDraw && transformer) {
      const projected = rectangleDraw.tool === 'door' && rectangleDraw.wall
        ? projectWallDoorRectangle(rectangleDraw.wall, rectangleDraw.start, rectangleDraw.current)
        : null
      if (rectangleDraw.wall) {
        const guide = [rectangleDraw.wall.start, rectangleDraw.wall.end]
          .map(point => transformer.buildingLocalToWorld(point, buildingId))
          .filter((point): point is LatLng => point !== null)
        if (guide.length === 2) features.push(pointsToLine(guide))
      }
      const localPoints = rectangleDraw.tool === 'door'
        ? projected?.ok ? projected.rectangle.points : []
        : localRectangleFromDrag(rectangleDraw.start, rectangleDraw.current)
      const worldPoints = localPoints
        .map(point => transformer.buildingLocalToWorld(point, buildingId))
        .filter((point): point is LatLng => point !== null)
      if (worldPoints.length === 4) features.push(pointsToPolygon(worldPoints))
    }
    updatePreview(map, features, mapReady)
  }, [map, mapReady, drawState.drawMode, drawState.pendingPoints, drawState.pendingPolygon, rectangleDraw, transformer, buildingId])

  const commitRoutePoints = useCallback((localPoints: RoutePointInput[]): RouteCommitOutcome => {
    if (readOnlyRef.current) return { status: 'skipped' }
    const currentTool = toolRef.current
    const bld = findBuilding(doc, buildingId)
    const fl = bld?.floors?.find((f: any) => f.level === floor)
    const floorId = fl?.id

    if (!floorId || !transformer || !map) return { status: 'skipped' }

    if (currentTool === 'hallway') {
      if (routeStartTargetRef.current && localPoints.length) localPoints[0] = {...routeStartTargetRef.current}
      const result = dispatcher.execute({
        id: localPoints.some(point => point.entranceId) ? 'floor.route.draw' : 'route.path.create', label: 'Create Route',
        payload: { buildingId, floorId, points: localPoints, nodeType: 'waypoint', edgeType: 'walk' },
      })
      if (!result?.success) return { status: 'rejected', error: result?.error ?? 'The Route could not be created.' }
      const routeData = result.data
      const nodeIds = routeData && Array.isArray(routeData.nodeIds)
        ? routeData.nodeIds.filter((nodeId: unknown): nodeId is string => typeof nodeId === 'string')
        : []
      const indoorRouteNodeId = nodeIds[0] ?? (typeof result.entityId === 'string' ? result.entityId : null)
      let anchorAccessRestore: NonNullable<EntranceAccessRequiredRequest['restore']['anchorAccessRestore']> | undefined

      if (pendingRouteAnchor) {
        if (!indoorRouteNodeId) {
          if (routeData && typeof routeData.buildingId === 'string' && typeof routeData.floorId === 'string' && typeof routeData.hadNetwork === 'boolean') {
            dispatcher.execute({
              id: 'route.path.create',
              label: 'Restore Route after failed Entrance connection',
              payload: {
                restore: true,
                buildingId: routeData.buildingId,
                floorId: routeData.floorId,
                hadNetwork: routeData.hadNetwork,
                previousNetwork: routeData.previousNetwork,
              },
            })
          }
          return { status: 'rejected', error: 'The Route was created without a usable first node, so the Entrance connection was not saved.' }
        }

        const accessResult = dispatcher.execute({
          id: 'entrance.access.assign',
          label: 'Connect Entrance to Route',
          payload: {
            buildingId,
            floorId,
            entranceId: pendingRouteAnchor.entranceId,
            outdoorNodeId: pendingRouteAnchor.outdoorNodeId,
            indoorRouteNodeId,
            ...(pendingRouteAnchor.outdoorRouteId ? { outdoorRouteId: pendingRouteAnchor.outdoorRouteId, outdoorPosition: pendingRouteAnchor.position } : {}),
          },
        })
        if (!accessResult?.success) {
          if (routeData && typeof routeData.buildingId === 'string' && typeof routeData.floorId === 'string' && typeof routeData.hadNetwork === 'boolean') {
            dispatcher.execute({
              id: 'route.path.create',
              label: 'Restore Route after failed Entrance connection',
              payload: {
                restore: true,
                buildingId: routeData.buildingId,
                floorId: routeData.floorId,
                hadNetwork: routeData.hadNetwork,
                previousNetwork: routeData.previousNetwork,
              },
            })
          }
          return { status: 'rejected', error: accessResult?.error ?? 'The Route was created, but the Entrance connection could not be saved.' }
        }

        anchorAccessRestore = {
          entranceId: pendingRouteAnchor.entranceId,
          previousEntranceAccess: accessResult.data?.previousEntranceAccess,
        }
        onRouteAccessAssigned?.({
          entranceId: pendingRouteAnchor.entranceId,
          outdoorNodeId: pendingRouteAnchor.outdoorNodeId,
          indoorRouteNodeId,
        })
      }

      const selectedId = pendingRouteAnchor?.entranceId ?? (typeof result.entityId === 'string' ? result.entityId : null)
      routeStartedRef.current = false
      routeStartTargetRef.current = null
      const store = editor.services.get('toolRegistry') as {activate?: (id:string)=>void} | undefined
      store?.activate?.('select')
      setRouteConnectionPrompt(null)
      dispatch({ type: 'RESET' })
      clearPreview(map)
      onSelect?.(selectedId)
      return { status: 'ok', data: anchorAccessRestore ? { ...(routeData ?? {}), anchorAccessRestore } : routeData }
    }

    if (currentTool === 'elevator') {
      const local = localPoints[0] ?? { x: 0, y: 0 }
      const pc = ElevatorDefinition.create({ position: local })
      const result = dispatcher.execute({
        id: 'feature.create', label: 'Create Elevator',
        payload: {
          buildingId,
          floor,
          id: pc.id,
          featureType: 'elevator',
          position: pc.position,
          rotation: pc.rotation,
          fromLevel: floor,
          toLevel: floor, // one floor; floors connect through links (2026-11-08)
          drawing: { definitionId: 'elevator', properties: pc.properties },
        },
      })
      if (!result?.success) return { status: 'rejected', error: result?.error ?? 'The Elevator could not be created.' }
      const selectedId = `${pc.id}-${floor}`
      dispatch({ type: 'RESET' })
      clearPreview(map)
      onSelect?.(selectedId)
      return { status: 'ok' }
    }

    return { status: 'skipped' }
  }, [map, doc, transformer, dispatcher, floor, buildingId, onSelect, pendingRouteAnchor, onRouteAccessAssigned])

  const buildPendingLocalPoints = useCallback((): RoutePointInput[] => {
    const points: RoutePointInput[] = []
    if (!transformer) return points
    for (const p of drawState.pendingPolygon) {
      const local = transformer.worldToBuildingLocal(p, buildingId)
      if (local) points.push(local)
    }
    return points
  }, [drawState.pendingPolygon, transformer, buildingId])

  const finishRouteAtEntrance = useCallback((entranceId: string, position: LatLng) => {
    if (!transformer) return
    const bld = findBuilding(doc, buildingId)
    const fl = bld?.floors?.find((candidate) => candidate.level === floor)
    if (!fl?.id) return
    const local = transformer.worldToBuildingLocal(position, buildingId)
    if (!local) return
    const localPoints = buildPendingLocalPoints()
    localPoints.push({ x: local.x, y: local.y, entranceId })
    const outcome = commitRoutePoints(localPoints)
    if (outcome.status === 'rejected') onRouteStartRejected?.(outcome.error)
  }, [transformer, doc, buildingId, floor, buildPendingLocalPoints, commitRoutePoints, onRouteStartRejected])

  const confirmPolygon = useCallback(() => {
    if (readOnlyRef.current) return
    const currentTool = toolRef.current
    if (!isPolygonAuthoringTool(currentTool)) return
    const minPoints = currentTool === 'hallway' ? 2 : 3
    if (drawState.pendingPolygon.length < minPoints || !map || !transformer) return

    const bld = findBuilding(doc, buildingId)
    const fl = bld?.floors?.find((f: any) => f.level === floor)
    const floorId = fl?.id

    if (!floorId) return

    const localPoints: RoutePointInput[] = []
    for (const p of drawState.pendingPolygon) {
      const local = transformer.worldToBuildingLocal(p, buildingId)
      if (local) localPoints.push(local)
    }

    const outcome = commitRoutePoints(localPoints)
    if (outcome.status === 'rejected') onRouteStartRejected?.(outcome.error)
  }, [drawState.pendingPolygon, map, doc, transformer, buildingId, floor, commitRoutePoints, onRouteStartRejected])

  const buildPromptLocalPoints = useCallback((): RoutePointInput[] | null => {
    if (!routeConnectionPrompt || !transformer) return null
    const localPoints: RoutePointInput[] = []
    for (const p of drawState.pendingPolygon) {
      const l = transformer.worldToBuildingLocal(p, buildingId)
      if (l) localPoints.push(l)
    }
    const promptLocal = transformer.worldToBuildingLocal(routeConnectionPrompt.position, buildingId)
    if (!promptLocal) return null
    return localPoints
  }, [routeConnectionPrompt, drawState.pendingPolygon, transformer, buildingId])

  const acceptRouteConnection = useCallback(() => {
    if (readOnlyRef.current) return
    if (!routeConnectionPrompt || !transformer) return
    const localPoints = buildPromptLocalPoints()
    const promptLocal = transformer.worldToBuildingLocal(routeConnectionPrompt.position, buildingId)
    if (!localPoints || !promptLocal) return
    localPoints.push({ x: promptLocal.x, y: promptLocal.y, junction: { edgeId: routeConnectionPrompt.edgeId, position: promptLocal } })
    const outcome = commitRoutePoints(localPoints)
    if (outcome.status === 'rejected') {
      // Keep the prompt open: the junction target was refused (e.g. a Door
      // connector) and the author must hear why instead of losing the choice.
      onRouteStartRejected?.(outcome.error)
      return
    }
    if (outcome.status !== 'ok') return
    routeStartedRef.current = false
    setRouteConnectionPrompt(null)
  }, [routeConnectionPrompt, transformer, buildingId, buildPromptLocalPoints, commitRoutePoints, onRouteStartRejected])

  const declineRouteConnection = useCallback(() => {
    if (readOnlyRef.current) return
    if (!routeConnectionPrompt || !transformer) return
    const localPoints = buildPromptLocalPoints()
    const promptLocal = transformer.worldToBuildingLocal(routeConnectionPrompt.position, buildingId)
    if (!localPoints || !promptLocal) return
    localPoints.push({ x: promptLocal.x, y: promptLocal.y })
    const outcome = commitRoutePoints(localPoints)
    if (outcome.status === 'rejected') {
      onRouteStartRejected?.(outcome.error)
      return
    }
    if (outcome.status !== 'ok') return
    routeStartedRef.current = false
    setRouteConnectionPrompt(null)
  }, [routeConnectionPrompt, transformer, buildingId, buildPromptLocalPoints, commitRoutePoints, onRouteStartRejected])

  const placeComponent = useCallback((position: LatLng, type: ComponentType) => {
    if (readOnlyRef.current) return
    const id = genId(type)
    let selectedComponentId = id
    const bld = findBuilding(doc, buildingId)
    const fl = bld?.floors?.find((f: any) => f.level === floor)
    const floorId = fl?.id
    if (!floorId || !transformer) return

    if (type === 'entrance') {
      if (editEngine) {
        editEngine.begin({ kind: 'create', entityType: 'entrance', geometry: position, properties: { name: 'Entrance', buildingId, floorId } })
        editEngine.doCommit()
      }
      // Entrances are stored in building-local metres; the click arrives as longitude/latitude.
      const local = transformer.worldToBuildingLocal(position, buildingId)
      if (!local || !Number.isFinite(local.x) || !Number.isFinite(local.y)) return
      dispatcher.execute({
        id: 'entrance.create', label: 'Create Entrance',
        payload: { buildingId, floorId, id, label: 'Entrance', position: { x: local.x, y: local.y }, level: floor, type: 'side' },
      })
    } else if (type === 'stair' || type === 'stairs' as any) {
      const localPos = transformer.worldToBuildingLocal(position, buildingId) ?? { x: 0, y: 0 }
      const pc = StairDefinition.create({ position: localPos })
      dispatcher.execute({
        id: 'feature.create', label: 'Create Staircase',
        payload: {
          buildingId,
          floor,
          id: pc.id,
          featureType: 'staircase',
          position: pc.position,
          rotation: pc.rotation,
          fromLevel: floor,
          toLevel: floor, // one floor; floors connect through links (2026-11-08)
          drawing: { definitionId: 'stair', properties: pc.properties },
        },
      })
      selectedComponentId = `${pc.id}-${floor}`
    } else if (type === 'elevator') {
      const localPos = transformer.worldToBuildingLocal(position, buildingId) ?? { x: 0, y: 0 }
      const pc = ElevatorDefinition.create({ position: localPos })
      dispatcher.execute({
        id: 'feature.create', label: 'Create Elevator',
        payload: {
          buildingId,
          floor,
          id: pc.id,
          featureType: 'elevator',
          position: pc.position,
          rotation: pc.rotation,
          fromLevel: floor,
          toLevel: floor, // one floor; floors connect through links (2026-11-08)
          drawing: { definitionId: 'elevator', properties: pc.properties },
        },
      })
      selectedComponentId = `${pc.id}-${floor}`
    }


    onSelect?.(selectedComponentId)
    if (map) {
      const feedback = placedItem(position, type.charAt(0).toUpperCase() + type.slice(1))
      updatePreview(map, [feedback])
      setTimeout(() => { if (map) clearPreview(map) }, 1500)
    }
  }, [dispatcher, transformer, buildingId, floor, doc, map, onSelect, editEngine])

  // Map click handler
  const handleMapClick = useCallback((e: maplibregl.MapMouseEvent) => {
    if (readOnlyRef.current) return
    const clickPosition: LatLng = { lat: e.lngLat.lat, lng: e.lngLat.lng }
    const previousClick = lastClickPositionRef.current
    lastClickPositionRef.current = { ...clickPosition }
    // A browser multi-click at the same spot is the double-click finish gesture;
    // a multi-click at a different spot is a fast author clicking corners.
    if ((e.originalEvent as MouseEvent).detail > 1 && previousClick && sameClickedSpot(previousClick, clickPosition)) {
      return
    }
    const currentTool = toolRef.current
    if (currentTool === 'select') {
      const layers = [
        'floor-rooms-fill',
        'floor-rooms-outline',
        'floor-stair-areas-fill',
        'floor-stair-areas-outline',
        'floor-stair-treads-line',
        'floor-stair-arrows-line',
        'floor-elevator-areas-fill',
        'floor-elevator-areas-outline',
        'floor-elevator-cabins-outline',
        'floor-items-stairs',
        'floor-items-entrance',
        'floor-draw-placed',
        'floor-route-nodes-circle',
        'floor-route-edges-line',
      ]

      const features = queryRenderedFeatures(map, e.point, layers)
      if (features.length > 0) {
        onSelect?.(features[0].properties?.id as string ?? null)
      } else {
        onSelect?.(null)
      }
      return
    }

    const pos = clickPosition

    switch (currentTool) {
      case 'space':
        // Room authoring targets an existing derived wall face. The active
        // FloorEditorCanvas click listener owns declaration/selection; this
        // drawing hook must never accumulate an independent polygon.
        break
      case 'hallway':
        if (!routeStartedRef.current && drawState.pendingPolygon.length === 0) {
          routeStartTargetRef.current = null
          const hits = map?.queryRenderedFeatures(e.point, {layers:[...ROUTE_TARGET_LAYER_IDS]}) ?? []
          const target = resolveRouteTargetHit(hits as never,pos)
          if (target && transformer && !pendingRouteAnchor) {
            const local=transformer.worldToBuildingLocal(target.position,buildingId)
            if (local) {
              routeStartTargetRef.current = {...local,...(target.kind==='entrance'?{entranceId:target.id}:target.kind==='node'?{existingNodeId:target.id}:{junction:{edgeId:target.id,position:local}})}
              dispatch({type:'ADD_POLYGON_POINT',point:target.position})
              routeStartedRef.current=true
              break
            }
          }

          const bld = findBuilding(doc, buildingId)
          const fl = bld?.floors?.find((candidate: any) => candidate.level === floor)
          const hasExistingRoute = (fl?.routeNetwork?.nodes?.length ?? 0) > 0
          const startError = routeStartError({ hasExistingRoute, hasEntranceAnchor: Boolean(pendingRouteAnchor) })
          if (startError) {
            onRouteStartRejected?.(startError)
            if (map) {
              const feedback = placedItem(pos, startError)
              updatePreview(map, [feedback], mapReady)
              setTimeout(() => { if (map) clearPreview(map, mapReady) }, 1800)
            }
            break
          }
          if (pendingRouteAnchor) {
            const start = snapRouteStartToEntrance(pos, pendingRouteAnchor)
            if (!start.accepted) {
              onRouteStartRejected?.(start.reason)
              if (map) {
                const feedback = placedItem(pos, start.reason)
                updatePreview(map, [feedback], mapReady)
                setTimeout(() => { if (map) clearPreview(map, mapReady) }, 1800)
              }
              break
            }
            dispatch({ type: 'ADD_POLYGON_POINT', point: start.position })
            routeStartedRef.current = true
            break
          }
        }
        if (drawState.pendingPolygon.length > 0 && map) {
          const hits = map.queryRenderedFeatures(e.point, { layers: [...ROUTE_TARGET_LAYER_IDS] })
          const target = resolveRouteTargetHit(hits as never, pos)
          if (target && transformer) {
            if (target.kind === 'node') {
              const local = transformer.worldToBuildingLocal(target.position, buildingId)
              const localPoints: RoutePointInput[] = []
              for (const p of drawState.pendingPolygon) {
                const l = transformer.worldToBuildingLocal(p, buildingId)
                if (l) localPoints.push(l)
              }
              if (local) {
                localPoints.push({ x: local.x, y: local.y, existingNodeId: target.id })
                const outcome = commitRoutePoints(localPoints)
                if (outcome.status === 'rejected') {
                  onRouteStartRejected?.(outcome.error)
                  break
                }
                routeStartedRef.current = false
                setRouteConnectionPrompt(null)
              }
              break
            }
            if (target.kind === 'edge') {
              setRouteConnectionPrompt({ edgeId: target.id, position: target.position })
              break
            }
            if (target.kind === 'entrance') {
              routeStartedRef.current = false
              setRouteConnectionPrompt(null)
              finishRouteAtEntrance(target.id, target.position)
              break
            }
          }
        }
        routeStartedRef.current = true
        dispatch({ type: 'ADD_POLYGON_POINT', point: pos })
        break
      case 'elevator':
        break
      case 'entrance':
        placeComponent(pos, 'entrance')
        break
      case 'stairs':
        break
      case 'door':
        break
      case 'window': {
        if (!transformer) break
        const bld = findBuilding(doc, buildingId)
        const fl = bld?.floors.find(candidate => candidate.level === floor)
        const localRaw = transformer.worldToBuildingLocal(pos, buildingId)
        if (!fl || !localRaw) break
        const ds = doorDrawRef.current
        if (!ds.start) {
          const chosen = findPlacementWall(fl.walls ?? [], localRaw)
          if (!chosen.ok) { setRectangleMessage(chosen.reason); break }
          const host = chosen.wall
          const hit = findNearestWall(localRaw, [host])!
          const next = { start: pos, startLocal: localRaw, wallId: host.id, startOffset: hit.offset, host }
          doorDrawRef.current = next
          setDoorDraw(next)
          setRectangleMessage('Window: choose the end point on the highlighted wall. Escape cancels.')
          const guide = [host.start, host.end]
            .map(point => transformer.buildingLocalToWorld(point, buildingId))
            .filter((point): point is LatLng => point !== null)
          updatePreview(map, [...(guide.length === 2 ? [pointsToLine(guide)] : []), placedItem(pos, 'Window start')], mapReady)
          break
        }
        const host = fl.walls?.find(wall => wall.id === ds.wallId)
        if (!host || !ds.host || JSON.stringify(host) !== JSON.stringify(ds.host)) {
          setRectangleMessage('The original wall changed. Cancel and start this window again.')
          break
        }
        const projected = projectWallWindow(ds.host, ds.startLocal!, localRaw)
        if (!projected.ok) { setRectangleMessage(projected.reason); break }
        const id = genId('opening')
        const result = dispatcher.execute({
          id: 'opening.create', label: 'Create Window',
          payload: { buildingId, floorId: fl.id, opening: { id, ...projected.opening, windowAppearance: 'fixed' } },
        })
        if (result?.success === false) {
          setRectangleMessage(`No window created — ${result.error || 'the editor rejected the opening.'}`)
          break
        }
        onSelect?.(id)
        const next = { start: null, startLocal: null, wallId: null, startOffset: null }
        doorDrawRef.current = next
        setDoorDraw(next)
        setRectangleMessage('Window created. Choose another wall span to place another.')
        clearPreview(map, mapReady)
        break
      }
      case 'wall': {
        const ws = wallDrawRef.current.start
        const wsLocal = wallDrawRef.current.startLocal
        if (!ws) {
          // First click — snap and record start point
          if (!transformer) break
          const bld = findBuilding(doc, buildingId)
          const fl = bld?.floors?.find((f: any) => f.level === floor)
          const floorId = fl?.id
          if (!floorId) break

          const localRaw = transformer.worldToBuildingLocal(pos, buildingId)
          if (!localRaw) break

          const existingWalls = collectWallSegments(doc, buildingId, floorId)
          const snapConfig = SNAP_CONFIGS[snapModeRef.current]
          const snapResult = snapWallAuthoringPoint(localRaw, snapConfig, existingWalls)

          const snappedLatLng = transformer.buildingLocalToWorld(snapResult.position, buildingId)
          if (!snappedLatLng) break

          setWallDraw({ start: snappedLatLng, startLocal: snapResult.position })
          if (map) {
            const src = map.getSource(DRAW_SRC) as maplibregl.GeoJSONSource
            if (src) {
              src.setData({
                type: 'FeatureCollection',
                features: [{
                  type: 'Feature', properties: { type: 'vertex', index: 0 },
                  geometry: { type: 'Point', coordinates: [snappedLatLng.lng, snappedLatLng.lat] },
                }],
              })
            }
          }
        } else {
          // Second click — snap end and create wall
          if (!transformer) break
          const bld = findBuilding(doc, buildingId)
          const fl = bld?.floors?.find((f: any) => f.level === floor)
          const floorId = fl?.id
          if (!floorId) break

          const localEndRaw = transformer.worldToBuildingLocal(pos, buildingId)
          if (!localEndRaw || !wsLocal) break

          const existingWalls = collectWallSegments(doc, buildingId, floorId)
          const snapConfig = SNAP_CONFIGS[snapModeRef.current]
          const snapResult = snapWallAuthoringPoint(localEndRaw, snapConfig, existingWalls, wsLocal)

          dispatcher.execute({
            id: 'wall.create', label: 'Create Wall',
            payload: {
              buildingId, floorId,
              start: wsLocal, end: snapResult.position,
              thickness: 0.15, height: 3.5,
            },
          })
          setWallDraw({ start: null, startLocal: null })
          if (map) clearPreview(map)
        }
        break
      }
    }
  }, [map, mapReady, placeComponent, onSelect, buildingId, floor, doc, transformer, dispatcher, drawState.pendingPolygon, pendingRouteAnchor, onRouteStartRejected, commitRoutePoints, finishRouteAtEntrance])

  // Doors use the same drag gesture, with a host wall frozen at pointer-down.
  useEffect(() => {
    if (!map) return
    const isRectangleTool = (value: string): value is FloorRectangleTool => value === 'door' || value === 'stairs' || value === 'elevator'
    const toLocal = (event: maplibregl.MapMouseEvent) => transformer?.worldToBuildingLocal({ lat: event.lngLat.lat, lng: event.lngLat.lng }, buildingId) ?? null
    const activeFloor = () => findBuilding(doc, buildingId)?.floors.find(candidate => candidate.level === floor)
    const handleMouseDown = (event: maplibregl.MapMouseEvent) => {
      if (readOnlyRef.current) return
      const currentTool = toolRef.current
      if (!isRectangleTool(currentTool) || event.originalEvent.button !== 0) return
      // Editing an existing footprint takes priority over starting another rectangle.
      if (queryRenderedFeatures(map, event.point, ['floor-vertex-handles-layer', 'floor-midpoint-handles-layer', 'floor-rotation-handle-layer']).length > 0) return
      const local = toLocal(event), currentFloor = activeFloor()
      if (!local || !currentFloor) { setRectangleMessage('The active floor coordinates are unavailable.'); return }
      let wall: Wall | undefined
      if (currentTool === 'door') {
        const host = findPlacementWall(currentFloor.walls ?? [], local)
        if (!host.ok) { setRectangleMessage(host.reason); return }
        wall = host.wall
      }
      map.dragPan?.disable()
      updateRectangleDraw({ tool: currentTool, start: local, current: local, wall, floorId: currentFloor.id })
      setRectangleMessage(currentTool === 'door' ? 'Door: drag along the wall for width and away from it for depth. Release to place.' : `${rectangleToolLabel(currentTool)}: drag to size, then release to create.`)
    }
    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      if (readOnlyRef.current) return
      const current = rectangleDrawRef.current
      if (!current) return
      if (current.tool !== toolRef.current) { updateRectangleDraw(null); map.dragPan?.enable(); return }
      const local = toLocal(event)
      if (local) updateRectangleDraw({ ...current, current: local })
    }
    const handleMouseUp = (event: maplibregl.MapMouseEvent) => {
      if (readOnlyRef.current) return
      const current = rectangleDrawRef.current
      if (!current) return
      const end = toLocal(event), currentFloor = activeFloor(), label = rectangleToolLabel(current.tool)
      updateRectangleDraw(null)
      map.dragPan?.enable()
      if (!end || !currentFloor || current.floorId !== currentFloor.id || current.tool !== toolRef.current) {
        setRectangleMessage(`${label} placement cancelled because the floor or tool changed.`)
        clearPreview(map, mapReady)
        return
      }
      let rectangle
      if (current.tool === 'door') {
        const host = currentFloor.walls?.find(wall => wall.id === current.wall?.id)
        if (!host || !current.wall || JSON.stringify(host) !== JSON.stringify(current.wall)) {
          setRectangleMessage('The host wall changed. Start door placement again.')
          clearPreview(map, mapReady)
          return
        }
        const projected = projectWallDoorRectangle(current.wall, current.start, end)
        if (!projected.ok) { setRectangleMessage(projected.reason); clearPreview(map, mapReady); return }
        rectangle = projected.rectangle
      } else {
        const bounds = normalizeLocalRectangle(current.start, end)
        const width = bounds.max.x - bounds.min.x, depth = bounds.max.y - bounds.min.y
        if (width < 0.2 || depth < 0.2) { setRectangleMessage(`No ${label} created — drag at least 0.2 m wide and deep.`); clearPreview(map, mapReady); return }
        rectangle = { min: bounds.min, max: bounds.max, center: { x: (bounds.min.x+bounds.max.x)/2, y: (bounds.min.y+bounds.max.y)/2 }, width, depth, points: localRectangleFromDrag(bounds.min,bounds.max) }
      }
      const entityId = genId(current.tool === 'door' ? 'door' : current.tool === 'stairs' ? 'stair' : 'elev')
      const authored = buildFloorRectangleCommand(current.tool, rectangle, { buildingId, floorId: currentFloor.id, floorLevel: floor, entityId })
      const result = dispatcher.execute(authored.command)
      if (result?.success !== false) {
        onSelect?.(authored.selectedId)
        setRectangleMessage(current.tool === 'door' ? 'Door created. Drag its corner dots to resize; its center stays on the wall. Drag elsewhere on a wall to place another.' : `${label} created. Drag to place another, or choose Navigate to edit.`)
      } else setRectangleMessage(`No ${label} created — ${result.error || 'the editor rejected the command.'}`)
      clearPreview(map, mapReady)
    }
    map.on('mousedown', handleMouseDown)
    map.on('mousemove', handleMouseMove)
    map.on('mouseup', handleMouseUp)
    return () => {
      try { map.off('mousedown', handleMouseDown) } catch {}
      try { map.off('mousemove', handleMouseMove) } catch {}
      try { map.off('mouseup', handleMouseUp) } catch {}
      if (rectangleDrawRef.current) map.dragPan?.enable()
    }
  }, [buildingId, dispatcher, doc, floor, map, mapReady, onSelect, transformer, updateRectangleDraw])
  // Right-click to cancel
  useEffect(() => {
    if (!map) return
    const handleContext = (e: maplibregl.MapMouseEvent) => {
      if (drawState.drawMode !== 'idle') {
        e.originalEvent.preventDefault()
        routeStartedRef.current = false
        dispatch({ type: 'RESET' })
        clearPreview(map)
      }
    }
    map.on('contextmenu', handleContext)
    return () => { map.off('contextmenu', handleContext) }
  }, [map, drawState.drawMode])

  // Double-click confirms polygon drawing
  const handleDblClick = useCallback((e: maplibregl.MapMouseEvent) => {
    if (readOnlyRef.current) return
    if (drawState.drawMode === 'idle') return
    e.originalEvent.preventDefault()
    confirmPolygon()
  }, [drawState.drawMode, confirmPolygon])

  // Attach click and double-click handlers
  useEffect(() => {
    if (!map) return
    map.on('click', handleMapClick)
    map.on('dblclick', handleDblClick)
    return () => {
      map.off('click', handleMapClick)
      map.off('dblclick', handleDblClick)
    }
  }, [map, handleMapClick, handleDblClick])

  const removeLastPoint = useCallback(() => {
    dispatch({ type: 'REMOVE_LAST_POLYGON_POINT' })
  }, [])

  return { drawMode: drawState.drawMode, pendingPoints: drawState.pendingPoints, pendingPolygon: drawState.pendingPolygon, rectangleMessage, snapMode, setSnapMode, confirm: confirmPolygon, cancel: () => { routeStartedRef.current = false; dispatch({ type: 'RESET' }); setDoorDraw({ start: null, startLocal: null, wallId: null, startOffset: null }); updateRectangleDraw(null); setRectangleMessage(rectangleReadyMessage(toolRef.current)); setRouteConnectionPrompt(null); if (map) { if (toolRef.current !== 'hallway') map.dragPan?.enable(); clearPreview(map) } }, removeLastPoint, routeConnectionPrompt, acceptRouteConnection, declineRouteConnection }
}
