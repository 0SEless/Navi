'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'

interface FloorPlanAlignmentProps {
  map: maplibregl.Map
  floorPlanCoords: [[number, number], [number, number], [number, number], [number, number]] | null
  buildingFp: { lat: number; lng: number }[]
  alignment: { offset?: { x: number; y: number }; scale?: number; rotation?: number }
  onChange: (align: { offset?: { x: number; y: number }; scale?: number; rotation?: number }) => void
}

const SNAP_THRESHOLD_PX = 10
const HANDLE_SIZE = 10

function handleStyle(color: string) {
  return {
    position: 'absolute' as const,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: '50%',
    background: '#fff',
    border: `2px solid ${color}`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    cursor: 'grab',
    transform: 'translate(-50%, -50%)',
    zIndex: 10,
  }
}

export function FloorPlanAlignment({ map, floorPlanCoords, buildingFp, alignment, onChange }: FloorPlanAlignmentProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [cornerPixels, setCornerPixels] = useState<[number, number][]>([])
  const [topCenter, setTopCenter] = useState<[number, number]>([0, 0])
  const [fpCornersPx, setFpCornersPx] = useState<[number, number][]>([])
  const [snapHighlight, setSnapHighlight] = useState<[number, number] | null>(null)

  // Refs to avoid state-driven effect re-registrations during drag
  const cornerPxRef = useRef(cornerPixels)
  cornerPxRef.current = cornerPixels
  const fpPxRef = useRef(fpCornersPx)
  fpPxRef.current = fpCornersPx
  const fpcRef = useRef(floorPlanCoords)
  fpcRef.current = floorPlanCoords
  const bfpRef = useRef(buildingFp)
  bfpRef.current = buildingFp

  const bodyDragRef = useRef<{
    startLngLat: { lng: number; lat: number }
    startOffset: { x: number; y: number }
  } | null>(null)

  const cornerDragRef = useRef<{
    startMouse: { x: number; y: number }
    startScale: number
  } | null>(null)

  const rotationDragRef = useRef<{
    centerPx: { x: number; y: number }
    startAngle: number
    startRotation: number
  } | null>(null)

  const getMapPoint = useCallback((clientX: number, clientY: number) => {
    const rect = map.getCanvas().getBoundingClientRect()
    return map.unproject([clientX - rect.left, clientY - rect.top])
  }, [map])

  // Project floor plan corners + footprint corners to screen pixels
  useEffect(() => {
    if (!floorPlanCoords) return
    const update = () => {
      setCornerPixels(floorPlanCoords.map((c) => {
        const p = map.project(c)
        return [p.x, p.y] as [number, number]
      }))
      const tc = map.project([
        (floorPlanCoords[0][0] + floorPlanCoords[1][0]) / 2,
        (floorPlanCoords[0][1] + floorPlanCoords[1][1]) / 2,
      ])
      setTopCenter([tc.x, tc.y])
      if (buildingFp.length >= 3) {
        setFpCornersPx(buildingFp.map((c) => {
          const p = map.project([c.lng, c.lat])
          return [p.x, p.y] as [number, number]
        }))
      }
    }
    update()
    map.on('move', update)
    return () => { map.off('move', update) }
  }, [map, floorPlanCoords, buildingFp])

  // Body drag: translate floor plan
  const handleBodyMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-handle]')) return
    e.preventDefault()
    const p = getMapPoint(e.clientX, e.clientY)
    bodyDragRef.current = {
      startLngLat: { lng: p.lng, lat: p.lat },
      startOffset: { x: alignment.offset?.x ?? 0, y: alignment.offset?.y ?? 0 },
    }
    setSnapHighlight(null)
    if (overlayRef.current) overlayRef.current.style.cursor = 'grabbing'
  }, [alignment.offset, getMapPoint])

  // Corner drag: uniform scale
  const handleCornerMouseDown = useCallback((_index: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    cornerDragRef.current = {
      startMouse: { x: e.clientX, y: e.clientY },
      startScale: alignment.scale ?? 1,
    }
  }, [alignment.scale])

  // Rotation handle drag
  const handleRotationMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!floorPlanCoords) return
    const centerLng = (floorPlanCoords[0][0] + floorPlanCoords[2][0]) / 2
    const centerLat = (floorPlanCoords[0][1] + floorPlanCoords[2][1]) / 2
    const cp = map.project([centerLng, centerLat])
    const angle = Math.atan2(e.clientY - cp.y, e.clientX - cp.x)
    rotationDragRef.current = {
      centerPx: { x: cp.x, y: cp.y },
      startAngle: angle,
      startRotation: alignment.rotation ?? 0,
    }
  }, [alignment.rotation, floorPlanCoords, map])

  // Window-level mouse handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Body drag
      const bd = bodyDragRef.current
      if (bd) {
        const cur = getMapPoint(e.clientX, e.clientY)
        const centerLat = (cur.lat + bd.startLngLat.lat) / 2
        const mpd = 111320
        const dx = (cur.lng - bd.startLngLat.lng) * mpd * Math.cos(centerLat * Math.PI / 180)
        const dy = (cur.lat - bd.startLngLat.lat) * mpd

        // Corner snap detection
        const corners = cornerPxRef.current
        const fpPx = fpPxRef.current
        const fpc = fpcRef.current
        const bfp = bfpRef.current
        let snapped = false
        if (fpc && bfp.length >= 3 && corners.length === 4) {
          for (let i = 0; i < 4; i++) {
            const [cx, cy] = corners[i]
            for (let j = 0; j < fpPx.length; j++) {
              const [fx, fy] = fpPx[j]
              if (Math.sqrt((cx - fx) ** 2 + (cy - fy) ** 2) < SNAP_THRESHOLD_PX) {
                const mpd2 = 111320
                const clat = (bfp[j].lat + fpc[i][1]) / 2
                const dLng = bfp[j].lng - fpc[i][0]
                const dLat = bfp[j].lat - fpc[i][1]
                const snapDx = dLng * mpd2 * Math.cos(clat * Math.PI / 180)
                const snapDy = dLat * mpd2
                onChange({ ...alignment, offset: { x: (alignment.offset?.x ?? 0) + snapDx, y: (alignment.offset?.y ?? 0) - snapDy } })
                setSnapHighlight([fx, fy])
                snapped = true
                break
              }
            }
            if (snapped) break
          }
        }
        if (!snapped) {
          onChange({ ...alignment, offset: { x: bd.startOffset.x + dx, y: bd.startOffset.y - dy } })
          setSnapHighlight(null)
        }
        return
      }

      // Corner drag (scale)
      const cd = cornerDragRef.current
      if (cd) {
        const rect = map.getCanvas().getBoundingClientRect()
        const cx = rect.width / 2
        const cy = rect.height / 2
        const startDist = Math.sqrt((cd.startMouse.x - cx) ** 2 + (cd.startMouse.y - cy) ** 2)
        const curDist = Math.sqrt((e.clientX - cx) ** 2 + (e.clientY - cy) ** 2)
        if (startDist > 0) {
          const factor = curDist / startDist
          const newScale = Math.max(0.1, Math.min(5, cd.startScale * factor))
          onChange({ ...alignment, scale: Math.round(newScale * 100) / 100 })
        }
        return
      }

      // Rotation drag
      const rd = rotationDragRef.current
      if (rd) {
        const currentAngle = Math.atan2(e.clientY - rd.centerPx.y, e.clientX - rd.centerPx.x)
        let deltaDeg = (currentAngle - rd.startAngle) * 180 / Math.PI
        let newRotation = rd.startRotation + deltaDeg
        if (e.shiftKey) {
          newRotation = Math.round(newRotation / 15) * 15
        } else {
          newRotation = Math.round(newRotation * 10) / 10
        }
        onChange({ ...alignment, rotation: newRotation })
      }
    }

    const handleMouseUp = () => {
      bodyDragRef.current = null
      cornerDragRef.current = null
      rotationDragRef.current = null
      setSnapHighlight(null)
      if (overlayRef.current) overlayRef.current.style.cursor = 'grab'
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [alignment, onChange, getMapPoint, map])

  if (!floorPlanCoords) return null

  return (
    <div ref={overlayRef} onMouseDown={handleBodyMouseDown}
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 5, cursor: 'grab', touchAction: 'none',
      }}
    >
      {snapHighlight && (
        <div style={{
          position: 'absolute', left: snapHighlight[0], top: snapHighlight[1],
          width: 20, height: 20, borderRadius: '50%',
          border: '2px solid #10B981',
          background: 'rgba(16, 185, 129, 0.15)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none', zIndex: 20,
        }} />
      )}

      {cornerPixels.map(([x, y], i) => (
        <div key={`corner-${i}`} data-handle={`corner-${i}`}
          onMouseDown={(e) => handleCornerMouseDown(i, e)}
          style={{
            ...handleStyle('#1C6BEB'),
            left: x, top: y,
          }}
        />
      ))}
      {topCenter[0] !== 0 && (
        <div data-handle="rotation"
          onMouseDown={handleRotationMouseDown}
          style={{
            ...handleStyle('#F59E0B'),
            borderColor: '#D97706',
            width: 14,
            height: 14,
            left: topCenter[0], top: topCenter[1] - 20,
          }}
          title="Drag to rotate (hold Shift to snap to 15\u00B0)"
        />
      )}
    </div>
  )
}
