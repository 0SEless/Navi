import { useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { ViewportState } from '../viewport'
import type { ToolContext, ToolPointerEvent } from '../tools'
import type { ToolRegistry } from '../tools'

interface MapCanvasProps {
  style: string
  viewport: ViewportState
  toolRegistry: ToolRegistry
  toolContext: ToolContext
  onViewportChange?: (vp: Partial<ViewportState>) => void
}

function makePointerEvent(e: React.PointerEvent, map: maplibregl.Map): ToolPointerEvent {
  const lngLat = map.unproject([e.clientX, e.clientY])
  return {
    x: e.clientX,
    y: e.clientY,
    lng: lngLat.lng,
    lat: lngLat.lat,
    button: e.button as 0 | 1 | 2,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
  }
}

export function MapCanvas({ style, viewport, toolRegistry, toolContext, onViewportChange }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [viewport.center.lng, viewport.center.lat],
      zoom: viewport.zoom,
      bearing: viewport.bearing,
      pitch: viewport.pitch,
      attributionControl: false,
    })

    map.on('move', () => {
      const center = map.getCenter()
      onViewportChange?.({
        zoom: map.getZoom(),
        center: { lat: center.lat, lng: center.lng },
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      })
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (map.isMoving()) return
    map.jumpTo({
      center: [viewport.center.lng, viewport.center.lat],
      zoom: viewport.zoom,
      bearing: viewport.bearing,
      pitch: viewport.pitch,
    })
  }, [viewport.center.lat, viewport.center.lng, viewport.zoom, viewport.bearing, viewport.pitch])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const map = mapRef.current
    const tool = toolRegistry.activeTool
    if (!map || !tool?.onPointerDown) return
    tool.onPointerDown(makePointerEvent(e, map), toolContext)
  }, [toolRegistry, toolContext])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const map = mapRef.current
    const tool = toolRegistry.activeTool
    if (!map || !tool?.onPointerMove) return
    tool.onPointerMove(makePointerEvent(e, map), toolContext)
  }, [toolRegistry, toolContext])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const map = mapRef.current
    const tool = toolRegistry.activeTool
    if (!map || !tool?.onPointerUp) return
    tool.onPointerUp(makePointerEvent(e, map), toolContext)
  }, [toolRegistry, toolContext])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tool = toolRegistry.activeTool
    if (!tool?.onKeyDown) return
    tool.onKeyDown({
      key: e.key,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
    }, toolContext)
  }, [toolRegistry, toolContext])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    />
  )
}
