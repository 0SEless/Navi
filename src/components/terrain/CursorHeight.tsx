'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type maplibregl from 'maplibre-gl'
import { toLocal, type TerrainSampler } from '@navi/core'

/**
 * The ground height under the pointer ("12.4 m"), next to the cursor, whatever tool is active:
 * how heights read without colours. Shows the committed ground (a stroke's preview shows its own shape).
 */
export function CursorHeight({ map, sampler }: { map: maplibregl.Map | null; sampler: TerrainSampler | null }) {
  const [at, setAt] = useState<{ x: number; y: number; heightM: number } | null>(null)
  const samplerRef = useRef(sampler)
  useEffect(() => {
    samplerRef.current = sampler
    if (!sampler) setAt(null)
  }, [sampler])

  useEffect(() => {
    if (!map) return
    const onMove = (event: maplibregl.MapMouseEvent) => {
      const s = samplerRef.current
      if (!s) return
      const q = toLocal(s.grid, { lat: event.lngLat.lat, lng: event.lngLat.lng })
      setAt({ x: event.point.x, y: event.point.y, heightM: s.heightAt(q.x, q.y) })
    }
    const onOut = () => setAt(null)
    map.on('mousemove', onMove)
    map.on('mouseout', onOut)
    return () => {
      map.off('mousemove', onMove)
      map.off('mouseout', onOut)
    }
  }, [map])

  if (!map || !at || !Number.isFinite(at.heightM)) return null
  return createPortal(
    <div
      role="status"
      style={{
        position: 'absolute', left: `${at.x + 14}px`, top: `${at.y + 14}px`, zIndex: 3, pointerEvents: 'none',
        padding: '1px 6px', fontSize: 11, fontVariantNumeric: 'tabular-nums', borderRadius: 4,
        background: 'rgba(17,24,39,0.78)', color: 'white', whiteSpace: 'nowrap',
      }}
    >
      {`${at.heightM.toFixed(1)} m`}
    </div>,
    map.getContainer(),
  )
}
