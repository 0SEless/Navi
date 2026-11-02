'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import type { CampusDocument } from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'

/**
 * Edit boundary: drag a corner to move it. Growing the boundary grows the ground area (new area reads
 * the base, or 0 m); shrinking hides ground outside it but keeps the changes.
 */
export function useBoundaryEditor(map: maplibregl.Map | null, opts: { active: boolean; document: CampusDocument; dispatch: (command: Command) => MutationResult | undefined }): void {
  const latest = useRef(opts)
  latest.current = opts
  const ring = opts.document.boundary?.points ?? []
  const key = ring.map((p) => `${p.lat},${p.lng}`).join(';')

  useEffect(() => {
    if (!map || !opts.active || ring.length < 3) return
    const closed = ring.length > 3 && ring[0].lat === ring[ring.length - 1].lat && ring[0].lng === ring[ring.length - 1].lng
    const corners = closed ? ring.slice(0, -1) : ring.slice()
    const markers = corners.map((corner, index) => {
      const element = document.createElement('div')
      element.setAttribute('aria-label', `Boundary corner ${index + 1}`)
      element.style.cssText = 'width:12px;height:12px;border-radius:50%;background:#2563eb;border:2px solid #fff;box-shadow:0 0 0 1px #2563eb;cursor:grab'
      const marker = new maplibregl.Marker({ element, draggable: true }).setLngLat([corner.lng, corner.lat]).addTo(map)
      marker.on('dragend', () => {
        const at = marker.getLngLat()
        const next = corners.map((p, k) => (k === index ? { lat: at.lat, lng: at.lng } : p))
        latest.current.dispatch({ id: 'boundary.set', label: 'Move boundary corner', payload: { points: closed ? [...next, next[0]] : next } })
      })
      return marker
    })
    return () => markers.forEach((marker) => marker.remove())
    // `key` stands for the boundary's points.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, opts.active, key])
}
