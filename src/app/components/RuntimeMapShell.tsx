'use client'

import { useEffect, useState, useRef } from 'react'
import { RuntimeEngine, ArtifactLoader } from '@navi/runtime'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

interface Props {
  baseUrl: string
}

export function RuntimeMapShell({ baseUrl }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [engine, setEngine] = useState<RuntimeEngine | null>(null)
  const mapContainer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loader = new ArtifactLoader({ baseUrl })
    RuntimeEngine.create(loader).then(setEngine).catch((e: Error) => setError(e.message))
  }, [baseUrl])

  useEffect(() => {
    if (!engine || !mapContainer.current) return
    const bb = engine.data.getBoundingBox()
    const center: [number, number] = [(bb.minLng + bb.maxLng) / 2, (bb.minLat + bb.maxLat) / 2]
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center,
      zoom: 15,
    })
    map.addControl(new maplibregl.NavigationControl())
    map.fitBounds([[bb.minLng, bb.minLat], [bb.maxLng, bb.maxLat]], { padding: 50 })
    return () => { map.remove() }
  }, [engine])

  if (error) {
    return <div style={{ padding: 24, color: 'red' }}>Failed to load campus: {error}</div>
  }

  if (!engine) {
    return <div style={{ padding: 24 }}>Loading campus...</div>
  }

  return <div ref={mapContainer} style={{ width: '100%', height: '100vh' }} />
}
