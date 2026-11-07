'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import type { CampusDocument } from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'
import { edgeMidpoints, insertCorner, removeCorner } from '@/lib/terrain/boundary-edit'
import { openRing } from '@/lib/terrain/terrain-start'
import { isTypingTarget } from './useTerrainShortcuts'

const CORNER_STYLE = 'width:12px;height:12px;border-radius:50%;background:#2563eb;border:2px solid #fff;box-shadow:0 0 0 1px #2563eb;cursor:grab'
const SELECTED_STYLE = 'width:14px;height:14px;border-radius:50%;background:#f59e0b;border:2px solid #fff;box-shadow:0 0 0 2px #b45309;cursor:grab'
const ADD_STYLE = 'width:14px;height:14px;border-radius:50%;background:#fff;border:1px solid #2563eb;color:#2563eb;font:600 11px/12px sans-serif;text-align:center;cursor:pointer'

/**
 * Edit boundary (section 5): drag a corner to move it, click "+" on an edge to add a corner there,
 * click a corner and press Delete to remove it. Growing the boundary grows the ground area (new
 * area reads the base, or 0 m); shrinking hides ground outside it but keeps the changes.
 */
export function useBoundaryEditor(map: maplibregl.Map | null, opts: {
  active: boolean
  document: CampusDocument
  dispatch: (command: Command) => MutationResult | undefined
  onMessage?: (text: string) => void
}): void {
  const latest = useRef(opts)
  latest.current = opts
  const ring = openRing(opts.document.boundary?.points ?? [])
  const key = ring.map((p) => `${p.lat},${p.lng}`).join(';')

  useEffect(() => {
    if (!map || !opts.active || ring.length < 3) return
    const corners = ring.slice()
    const set = (points: typeof corners, label: string) => latest.current.dispatch({ id: 'boundary.set', label, payload: { points } })
    let selected: number | null = null
    // A drag ends with a click on some browsers: clicks right after a drag do not select.
    let draggedAt = 0

    const cornerMarkers = corners.map((corner, index) => {
      const element = document.createElement('div')
      element.setAttribute('aria-label', `Boundary corner ${index + 1}`)
      element.style.cssText = CORNER_STYLE
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        if (Date.now() - draggedAt < 300) return
        selected = selected === index ? null : index
        cornerMarkers.forEach((marker, k) => { marker.getElement().style.cssText = k === selected ? SELECTED_STYLE : CORNER_STYLE })
      })
      const marker = new maplibregl.Marker({ element, draggable: true }).setLngLat([corner.lng, corner.lat]).addTo(map)
      marker.on('dragend', () => {
        draggedAt = Date.now()
        const at = marker.getLngLat()
        set(corners.map((p, k) => (k === index ? { lat: at.lat, lng: at.lng } : p)), 'Move boundary corner')
      })
      return marker
    })

    const addMarkers = edgeMidpoints(corners).map((middle, edge) => {
      const element = document.createElement('div')
      element.setAttribute('aria-label', `Add boundary corner on edge ${edge + 1}`)
      element.style.cssText = ADD_STYLE
      element.textContent = '+'
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        set(insertCorner(corners, edge, middle), 'Add boundary corner')
      })
      return new maplibregl.Marker({ element }).setLngLat([middle.lng, middle.lat]).addTo(map)
    })

    const onKey = (event: KeyboardEvent) => {
      if (selected === null || (event.key !== 'Delete' && event.key !== 'Backspace') || isTypingTarget(event.target)) return
      event.preventDefault()
      const next = removeCorner(corners, selected)
      if (!next) {
        latest.current.onMessage?.('A boundary needs at least 3 corners.')
        return
      }
      set(next, 'Remove boundary corner')
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      cornerMarkers.forEach((marker) => marker.remove())
      addMarkers.forEach((marker) => marker.remove())
    }
    // `key` stands for the boundary's points.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, opts.active, key])
}
