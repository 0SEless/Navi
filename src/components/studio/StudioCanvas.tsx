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
import { useEditor, CAMPUS_TOOL_GROUPS, useToolDockShortcuts } from '@navi/editor'
import { useCampusBoundary } from './CampusBoundary'
import { useOsmImportTool } from './OsmImportTool'
import { ImportToast, showImportToast } from './ImportToast'
import { useBuildingTracer } from './BuildingTracer'
import { useVertexEditor } from './useVertexEditor'
import { useMarkerDrag } from './useMarkerDrag'
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
import { StyleSelector } from './StyleSelector'
import { PositionEditHint } from './PositionEditHint'

interface StudioCanvasProps {
  center?: { lat: number; lng: number }
}

export function StudioCanvas({ center }: StudioCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null)

  const drawing = useDrawingSession()

  useVertexEditor(mapInstance)
  useMarkerDrag(mapInstance)

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

  const { services: studioServices } = useEditor()
  const toolRegistry = studioServices.get('toolRegistry')!

  // Data sync + visibility + style switching are managed by <MapRenderer>
  // Selection highlight is managed by <SelectionOverlay />
  // Cursor + dragPan are managed by <InteractionController />

  useToolController()

  // Default to select tool on mount
  useEffect(() => {
    if (!toolRegistry) return
    if (!toolRegistry.activeToolId) toolRegistry.activate('select')
  }, [toolRegistry])

  useToolDockShortcuts(CAMPUS_TOOL_GROUPS, toolRegistry?.activeToolId ?? '', (id) => toolRegistry?.activate(id))

  useCampusBoundary(mapInstance, undefined, drawing, {
    toolId: 'set-boundary',
    autoConfirm: true,
    onAutoConfirm: (result) => {
      const dispatcher = studioServices.get('dispatcher')!
      dispatcher.execute({
        id: 'boundary.set',
        label: 'Set Campus Boundary',
        payload: { points: result.points },
      })
      showImportToast({ message: 'Campus boundary updated', type: 'success' })
    },
  })

  useOsmImportTool(mapInstance, (result) => {
    if (result.success) {
      showImportToast({ message: `Imported ${result.count} buildings from OSM`, type: 'success' })
    } else {
      showImportToast({ message: result.error || 'Import failed', type: 'error' })
    }
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
      <ImportToast />
      <DrawingSessionProvider value={drawing}>
        {mapInstance && <DrawingOverlay map={mapInstance} />}
        {mapInstance && <PreviewOverlay map={mapInstance} />}
      </DrawingSessionProvider>
      {mapInstance && <SelectionOverlay map={mapInstance} />}
      {mapInstance && <MapRenderer map={mapInstance} />}
      {mapInstance && <ViewportController map={mapInstance} initialCenter={center} />}
      {mapInstance && <InteractionController map={mapInstance} onSetRoomDrag={drawing.setRoomDrag} drawing={drawing} />}
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
        <StyleSelector />
      </div>
      <PositionEditHint />
    </div>
  )
}
