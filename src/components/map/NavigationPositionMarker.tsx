'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import {
  buildNavigationHeadingBeamGeoJson,
  createNavigationHeadingBeamLayers,
} from '@/lib/navigation-heading-arrow'
import { useNavigationMap } from './NavigationMap'
import { useOptionalNavigationContext } from './NavigationContext'

export const NAVIGATION_DIRECTION_ARROW_IMAGE_ID = 'navigate-direction-arrow-icon'
export const NAVIGATION_DIRECTION_ARROW_SOURCE_ID = 'navigate-current-direction'
export const NAVIGATION_DIRECTION_BEAM_LAYER_ID = 'navigate-current-direction-beam'
export const NAVIGATION_DIRECTION_BEAM_CORE_LAYER_ID = 'navigate-current-direction-core'
// Retained as identifiers for cleanup of maps created by the previous cone renderer.
export const NAVIGATION_DIRECTION_ARROW_LAYER_OUTER_ID = 'navigate-current-direction-outer'
export const NAVIGATION_DIRECTION_ARROW_LAYER_INNER_ID = 'navigate-current-direction-inner'
export const NAVIGATION_POSITION_MARKER_SOURCE_ID = 'navigate-current-position'

function isValidPosition(position: { lat: number; lng: number } | null | undefined): position is { lat: number; lng: number } {
  return position !== null
    && position !== undefined
    && Number.isFinite(position.lat)
    && Number.isFinite(position.lng)
}

function createMarkerElement(): HTMLDivElement {
  const element = document.createElement('div')
  element.dataset.testid = 'navigation-position-marker'
  element.setAttribute('aria-label', 'Current location')
  element.style.width = '32px'
  element.style.height = '32px'
  element.style.pointerEvents = 'none'
  element.style.position = 'relative'

  const halo = document.createElement('span')
  halo.style.position = 'absolute'
  halo.style.inset = '3px'
  halo.style.borderRadius = '9999px'
  halo.style.background = 'rgba(16, 185, 129, 0.22)'

  const dot = document.createElement('span')
  dot.style.position = 'absolute'
  dot.style.left = '50%'
  dot.style.top = '50%'
  dot.style.width = '13px'
  dot.style.height = '13px'
  dot.style.transform = 'translate(-50%, -50%)'
  dot.style.border = '3px solid white'
  dot.style.borderRadius = '9999px'
  dot.style.background = '#10b981'
  dot.style.boxShadow = '0 1px 5px rgba(15, 23, 42, 0.45)'

  element.append(halo, dot)
  return element
}

function removeDirectionLayers(map: maplibregl.Map): void {
  try {
    if (typeof map.getLayer === 'function') {
      ;[
        NAVIGATION_DIRECTION_BEAM_LAYER_ID,
        NAVIGATION_DIRECTION_BEAM_CORE_LAYER_ID,
        NAVIGATION_DIRECTION_ARROW_LAYER_OUTER_ID,
        NAVIGATION_DIRECTION_ARROW_LAYER_INNER_ID,
      ].forEach((layerId) => {
        if (map.getLayer(layerId)) map.removeLayer(layerId)
      })
    }
    if (typeof map.getSource === 'function' && map.getSource(NAVIGATION_DIRECTION_ARROW_SOURCE_ID)) {
      map.removeSource(NAVIGATION_DIRECTION_ARROW_SOURCE_ID)
    }
  } catch {
    // NavigationMap can tear down its MapLibre instance before child cleanup.
  }
}

/** Passive current-position rendering with one compact heading beam. */
export function NavigationPositionMarker() {
  const { map, isReady } = useNavigationMap()
  const navigationContext = useOptionalNavigationContext()
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const position = navigationContext?.location ?? null
  const heading = navigationContext?.heading ?? null
  const hasPosition = isValidPosition(position)

  // Set up Navigate-only beam layers. Capture owns its separate symbol arrow.
  useEffect(() => {
    if (!map || !isReady || !hasPosition) return undefined

    if (!map.getSource(NAVIGATION_DIRECTION_ARROW_SOURCE_ID)) {
      map.addSource(NAVIGATION_DIRECTION_ARROW_SOURCE_ID, {
        type: 'geojson',
        data: buildNavigationHeadingBeamGeoJson(null, null),
      })
    }

    createNavigationHeadingBeamLayers(NAVIGATION_DIRECTION_ARROW_SOURCE_ID).forEach((layer) => {
      if (!map.getLayer(layer.id)) map.addLayer(layer as never)
    })

    return () => removeDirectionLayers(map)
  }, [hasPosition, isReady, map])

  // Update beam data when heading or position changes.
  useEffect(() => {
    if (!map || !isReady) return

    const source = map.getSource(NAVIGATION_DIRECTION_ARROW_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    source?.setData(buildNavigationHeadingBeamGeoJson(
      isValidPosition(position)
        ? { latitude: position.lat, longitude: position.lng }
        : null,
      heading,
    ))
  }, [heading, isReady, map, position])

  // Clean up marker on unmount
  useEffect(() => {
    if (!map || !isReady) return undefined

    return () => {
      markerRef.current?.remove()
      markerRef.current = null
    }
  }, [isReady, map])

  // Position dot marker
  useEffect(() => {
    if (!map || !isReady) return

    if (!isValidPosition(position)) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }

    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({
        element: createMarkerElement(),
        anchor: 'center',
      }).setLngLat([position.lng, position.lat]).addTo(map)
    } else {
      markerRef.current.setLngLat([position.lng, position.lat])
    }

  }, [isReady, map, position])

  return null
}

export default NavigationPositionMarker
