'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import type { TracingImage } from '@/lib/terrain/tracing-store'
import { overlayAnchor, TRACING_LAYER } from '@/lib/terrain/terrain-view'
import { whenStyleReady } from '@/lib/terrain/style-ready'

const SOURCE = TRACING_LAYER

/** Draws the tracing image (local only) with two draggable corners to place it. */
export function TracingImageLayer({ map, image, visible, onPlace }: {
  map: maplibregl.Map | null
  image: TracingImage | null
  visible: boolean
  onPlace: (bounds: { west: number; east: number; south: number; north: number }) => void
}) {
  const latest = useRef(onPlace)
  latest.current = onPlace

  useEffect(() => {
    if (!map || !image || !visible) return
    const url = URL.createObjectURL(image.blob)
    const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
      [image.west, image.north], [image.east, image.north], [image.east, image.south], [image.west, image.south],
    ]
    const add = () => {
      if (map.getLayer(SOURCE)) map.removeLayer(SOURCE)
      if (map.getSource(SOURCE)) map.removeSource(SOURCE)
      map.addSource(SOURCE, { type: 'image', url, coordinates })
      map.addLayer({ id: SOURCE, type: 'raster', source: SOURCE, paint: { 'raster-opacity': image.opacity } }, overlayAnchor(map))
    }
    whenStyleReady(map, add)

    const corner = (lng: number, lat: number, label: string) => {
      const element = document.createElement('div')
      element.setAttribute('aria-label', label)
      element.style.cssText = 'width:12px;height:12px;background:#7c3aed;border:2px solid #fff;cursor:grab'
      return new maplibregl.Marker({ element, draggable: true }).setLngLat([lng, lat]).addTo(map)
    }
    const northWest = corner(image.west, image.north, 'Tracing image north-west corner')
    const southEast = corner(image.east, image.south, 'Tracing image south-east corner')
    const place = () => {
      const a = northWest.getLngLat()
      const b = southEast.getLngLat()
      latest.current({ west: Math.min(a.lng, b.lng), east: Math.max(a.lng, b.lng), south: Math.min(a.lat, b.lat), north: Math.max(a.lat, b.lat) })
    }
    northWest.on('dragend', place)
    southEast.on('dragend', place)

    return () => {
      northWest.remove()
      southEast.remove()
      if (map.getStyle()) {
        if (map.getLayer(SOURCE)) map.removeLayer(SOURCE)
        if (map.getSource(SOURCE)) map.removeSource(SOURCE)
      }
      URL.revokeObjectURL(url)
    }
  }, [map, image, visible])

  return null
}
