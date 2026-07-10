'use client'

import { useEffect, useRef } from 'react'
import { useEditor } from '@navi/editor'
import type { ViewportCommand } from '@navi/editor'
import maplibregl from 'maplibre-gl'

interface ViewportControllerProps {
  map: maplibregl.Map
  initialCenter?: { lat: number; lng: number }
}

export function ViewportController({ map, initialCenter }: ViewportControllerProps) {
  const { services } = useEditor()
  const viewport = services.get('viewport')
  const eventBus = services.get('eventBus')
  const readyRef = useRef(false)

  useEffect(() => {
    if (initialCenter && !readyRef.current) {
      map.flyTo({ center: [initialCenter.lng, initialCenter.lat], zoom: 17 })
      readyRef.current = true
    }
  }, [map, initialCenter])

  useEffect(() => {
    if (!viewport || !eventBus) return

    const executeCommand = () => {
      const cmd: ViewportCommand | null = viewport.consumePendingCommand()
      if (!cmd) return

      switch (cmd.type) {
        case 'flyTo':
          if (cmd.center) {
            map.flyTo({
              center: [cmd.center.lng, cmd.center.lat],
              zoom: cmd.zoom,
              duration: cmd.duration ?? 500,
            })
          }
          break
        case 'fitBounds':
          if (cmd.bounds) {
            const bounds = new maplibregl.LngLatBounds(
              [cmd.bounds.sw.lng, cmd.bounds.sw.lat],
              [cmd.bounds.ne.lng, cmd.bounds.ne.lat],
            )
            map.fitBounds(bounds, { padding: cmd.padding ?? 80, duration: cmd.duration ?? 500 })
          }
          break
        case 'easeTo':
          map.easeTo({
            center: cmd.center ? [cmd.center.lng, cmd.center.lat] : undefined,
            zoom: cmd.zoom,
            bearing: cmd.bearing,
            pitch: cmd.pitch,
            duration: cmd.duration ?? 500,
          })
          break
        case 'reset':
          map.flyTo({ center: [0, 0], zoom: 15, bearing: 0, pitch: 0 })
          break
        case 'zoomToSelection':
          break
      }
    }

    executeCommand()

    const unsub = eventBus.on('viewport.changed', executeCommand)
    return () => { unsub() }
  }, [map, viewport, eventBus])

  return null
}
