'use client'

import { useRef, useEffect } from 'react'
import maplibregl from 'maplibre-gl'

interface FloorPlanAlignmentProps {
  map: maplibregl.Map
  floorPlanCoords: [[number, number], [number, number], [number, number], [number, number]] | null
  alignment: { offset?: { x: number; y: number }; scale?: number; rotation?: number }
  onChange: (align: { offset?: { x: number; y: number }; scale?: number; rotation?: number }) => void
}

const HANDLE_STYLE = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  background: '#FFFFFF',
  border: '2px solid #1C6BEB',
  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
  cursor: 'grab',
  zIndex: 10,
} as const

const ROTATION_HANDLE_STYLE = {
  width: 16,
  height: 16,
  borderRadius: '50%',
  background: '#F59E0B',
  border: '2px solid #D97706',
  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
  cursor: 'grab',
  zIndex: 10,
} as const

export function FloorPlanAlignment({ map, floorPlanCoords, alignment, onChange }: FloorPlanAlignmentProps) {
  const markersRef = useRef<maplibregl.Marker[]>([])
  const draggingRef = useRef<{ type: 'corner' | 'rotation'; index: number; startMouse: { x: number; y: number }; startAlignment: typeof alignment } | null>(null)

  // Create markers with valid initial position, add to map
  useEffect(() => {
    if (markersRef.current.length > 0 || !floorPlanCoords) return

    const markers: maplibregl.Marker[] = []

    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div')
      Object.assign(el.style, HANDLE_STYLE)
      el.dataset.handleIndex = String(i)
      const m = new maplibregl.Marker({ element: el })
      m.setLngLat(floorPlanCoords[i])
      m.addTo(map)
      markers.push(m)
    }

    const rotEl = document.createElement('div')
    Object.assign(rotEl.style, ROTATION_HANDLE_STYLE)
    rotEl.dataset.handleIndex = '4'
    const rotM = new maplibregl.Marker({ element: rotEl })
    const topCenter: [number, number] = [
      (floorPlanCoords[0][0] + floorPlanCoords[1][0]) / 2,
      (floorPlanCoords[0][1] + floorPlanCoords[1][1]) / 2,
    ]
    rotM.setLngLat(topCenter)
    rotM.addTo(map)
    markers.push(rotM)

    markersRef.current = markers

    return () => {
      markers.forEach(m => { try { m.remove() } catch {} })
      markersRef.current = []
    }
  }, [map, floorPlanCoords])

  // Update marker positions when coordinates change
  useEffect(() => {
    const markers = markersRef.current
    if (!markers.length || !floorPlanCoords) return
    for (let i = 0; i < 4; i++) markers[i].setLngLat(floorPlanCoords[i])
    const topCenter: [number, number] = [
      (floorPlanCoords[0][0] + floorPlanCoords[1][0]) / 2,
      (floorPlanCoords[0][1] + floorPlanCoords[1][1]) / 2,
    ]
    markers[4].setLngLat(topCenter)
  }, [floorPlanCoords])

  // Drag interaction
  useEffect(() => {
    const markers = markersRef.current
    if (!markers.length || !floorPlanCoords) return

    const onMouseDown = (e: MouseEvent, handleIndex: number) => {
      e.preventDefault()
      draggingRef.current = {
        type: handleIndex === 4 ? 'rotation' : 'corner',
        index: handleIndex,
        startMouse: { x: e.clientX, y: e.clientY },
        startAlignment: { ...alignment, offset: { ...(alignment.offset ?? { x: 0, y: 0 }) } },
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      const drag = draggingRef.current
      if (!drag) return

      const dx = e.clientX - drag.startMouse.x
      const dy = e.clientY - drag.startMouse.y

      if (drag.type === 'rotation') {
        // Map drag to rotation (horizontal = 1 deg per px, vertical ignored)
        const newRotation = (drag.startAlignment.rotation ?? 0) + dx * 0.5
        onChange({ ...alignment, rotation: Math.round(newRotation * 10) / 10 })
      } else {
        // Corner drag → scale (distance change from center)
        const mapDim = map.getContainer()
        const cx = mapDim.clientWidth / 2
        const cy = mapDim.clientHeight / 2
        const startDist = Math.sqrt(
          (drag.startMouse.x - cx) ** 2 + (drag.startMouse.y - cy) ** 2
        )
        const curDist = Math.sqrt(
          (e.clientX - cx) ** 2 + (e.clientY - cy) ** 2
        )
        if (startDist > 0) {
          const scaleFactor = curDist / startDist
          const newScale = Math.max(0.1, Math.min(5, (drag.startAlignment.scale ?? 1) * scaleFactor))
          onChange({ ...alignment, scale: Math.round(newScale * 100) / 100 })
        }
      }
    }

    const onMouseUp = () => {
      draggingRef.current = null
    }

    for (let i = 0; i < markers.length; i++) {
      const el = markers[i].getElement()
      el.addEventListener('mousedown', (e: Event) => onMouseDown(e as MouseEvent, i))
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      for (let i = 0; i < markers.length; i++) {
        const el = markers[i]?.getElement()
        if (el) {
          el.replaceWith(el.cloneNode(true))
        }
      }
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [map, alignment, onChange, floorPlanCoords])

  return null
}
