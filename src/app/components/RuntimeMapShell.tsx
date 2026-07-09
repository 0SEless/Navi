'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { RuntimeEngine, ArtifactLoader } from '@navi/runtime'
import type { Route, CurrentPosition } from '@navi/runtime'
import { BlueDot } from './RuntimeMap/BlueDot'
import { RouteOverlay } from './RuntimeMap/RouteOverlay'
import { InstructionPanel } from './RuntimeMap/InstructionPanel'
import { BuildingSelector } from './RuntimeMap/BuildingSelector'

interface Props {
  baseUrl: string
}

export function RuntimeMapShell({ baseUrl }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [engine, setEngine] = useState<RuntimeEngine | null>(null)
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [route, setRoute] = useState<Route | null>(null)
  const [position, setPosition] = useState<CurrentPosition | null>(null)
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null)
  const mapContainer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loader = new ArtifactLoader({ baseUrl })
    RuntimeEngine.create(loader).then(setEngine).catch((e: Error) => setError(e.message))
  }, [baseUrl])

  useEffect(() => {
    if (!engine || !mapContainer.current) return
    const bb = engine.data.getBoundingBox()
    const center: [number, number] = [(bb.minLng + bb.maxLng) / 2, (bb.minLat + bb.maxLat) / 2]
    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center,
      zoom: 15,
    })
    m.addControl(new maplibregl.NavigationControl())
    m.fitBounds([[bb.minLng, bb.minLat], [bb.maxLng, bb.maxLat]], { padding: 50 })
    setMap(m)
    engine.position.updateGps({ lng: (bb.minLng + bb.maxLng) / 2, lat: (bb.minLat + bb.maxLat) / 2 })
    setPosition(engine.position.getCurrentPosition())
    return () => { m.remove() }
  }, [engine])

  const findRoute = useCallback((from: string, to: string) => {
    if (!engine) return
    setRoute(engine.routing.findRoute(from, to))
  }, [engine])

  const clearRoute = useCallback(() => setRoute(null), [])

  if (error) {
    return <div style={{ padding: 24, color: 'red' }}>Failed to load campus: {error}</div>
  }

  if (!engine) {
    return <div style={{ padding: 24 }}>Loading campus...</div>
  }

  const buildings = engine.data.getBuildings().buildings

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', gap: 8 }}>
        <BuildingSelector
          buildings={buildings}
          selected={selectedBuilding}
          onSelect={setSelectedBuilding}
        />
        {position && (
          <button
            onClick={() => findRoute(position.nodeId, '')}
            style={{
              padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db',
              fontSize: 14, background: 'white', cursor: 'pointer',
            }}
          >
            Route from here
          </button>
        )}
      </div>
      <InstructionPanel route={route} onClose={clearRoute} />
      <div ref={mapContainer} style={{ width: '100%', height: '100vh' }} />
      {map && <BlueDot map={map} position={position} />}
      {map && <RouteOverlay map={map} route={route} />}
    </div>
  )
}
