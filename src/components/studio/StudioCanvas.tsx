'use client'

/**
 * ── Architectural Invariant (M2.6) ─────────────────────────────────
 *
 * StudioCanvas is the EDITOR COMPOSITION ROOT.
 *
 * It MUST NOT import application stores:
 *   - useGraphStore        (Graph / rendering data)
 *   - useStudioStore       (tool, layers, selection, edit target)
 *   - DocumentStore / WorkflowStore / any @navi/editor service
 *
 * It owns exactly one responsibility: construct the editor by wiring
 * subsystems together. All application state lives in the owning
 * subsystems:
 *
 *   MapRenderer          → rendering (GeoJSON, visibility, style)
 *   InteractionController→ editing interactions (cursor, dragPan, hit-test)
 *   ViewportController   → camera
 *   SelectionOverlay     → selection highlight
 *   ConfirmBar           → self-manages tool + visibility from Zustand
 *   ConfirmOverlayAdapter→ temporary bridge (deleted when ConfirmOverlay migrates)
 *
 * If future work needs store access inside StudioCanvas, the answer is
 * always: move the responsibility into the owning subsystem.
 * ──────────────────────────────────────────────────────────────────
 */

import { useRef, useEffect, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useCampusBoundary } from './CampusBoundary'
import { useBuildingTracer } from './BuildingTracer'
import { useVertexEditor } from './useVertexEditor'
import { ConfirmBar } from './ConfirmBar'
import { ConfirmOverlayAdapter } from './ConfirmOverlayAdapter'
import { SelectionOverlay } from './SelectionOverlay'
import { DrawingOverlay } from './DrawingOverlay'
import { PreviewOverlay } from './PreviewOverlay'
import { DrawingSessionProvider } from './useDrawingSession'
import { useDrawingSession } from './useDrawingSession'
import { ViewportController } from './ViewportController'
import { useToolController } from './useToolController'
import { InteractionController } from './InteractionController'
import { MapRenderer, getInitialMapStyle } from './rendering/MapRenderer'

interface StudioCanvasProps {
  center?: { lat: number; lng: number }
}

export function StudioCanvas({ center }: StudioCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null)

  const drawing = useDrawingSession()

  useVertexEditor(mapInstance)

  useEffect(() => {
    if (mapRef.current) return
    const container = mapContainerRef.current
    if (!container) return
    let mounted = true
    const c = center ?? { lat: 11.8195, lng: 122.0922 }
    const map = new maplibregl.Map({
      container,
      style: getInitialMapStyle(),
      center: [c.lng, c.lat],
      zoom: center ? 17 : 4,
    })
    map.on('load', () => {
      if (!mounted) return
      setMapInstance(map)
    })
    mapRef.current = map
    return () => {
      mounted = false
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Data sync + visibility + style switching are managed by <MapRenderer>
  // Selection highlight is managed by <SelectionOverlay />
  // Cursor + dragPan are managed by <InteractionController />

  useToolController()

  useCampusBoundary(mapInstance, (result) => {
    drawing.setDrawPoints(result.points)
    drawing.requestConfirm('boundary')
  }, drawing)

  useBuildingTracer(mapInstance, (result) => {
    drawing.setDrawPoints(result.points)
    drawing.requestConfirm('building')
  }, drawing)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      <ConfirmBar drawing={drawing} />
      <ConfirmOverlayAdapter drawing={drawing} />
      <DrawingSessionProvider value={drawing}>
        {mapInstance && <DrawingOverlay map={mapInstance} />}
        {mapInstance && <PreviewOverlay map={mapInstance} />}
      </DrawingSessionProvider>
      {mapInstance && <SelectionOverlay map={mapInstance} />}
      {mapInstance && <MapRenderer map={mapInstance} />}
      {mapInstance && <ViewportController map={mapInstance} initialCenter={center} />}
      {mapInstance && <InteractionController map={mapInstance} onSetRoomDrag={drawing.setRoomDrag} drawing={drawing} />}
    </div>
  )
}
