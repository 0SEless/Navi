'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type maplibregl from 'maplibre-gl'
import { effectiveBuildingBase, type CampusDocument, type TerrainSampler } from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'
import { metresForDrag, padAfterLowering, sideViewCamera, SIDE_VIEW_PITCH } from '@/lib/terrain/height-edit'
import type { TerrainMapProps } from './TerrainMap'

export type HeightEditTarget = { kind: 'building'; buildingId: string }
type Draft = NonNullable<TerrainMapProps['draft']>
type SavedCamera = { center: { lng: number; lat: number }; zoom: number; bearing: number; pitch: number }

const HINT_MS = 3000
const label: React.CSSProperties = {
  position: 'absolute', zIndex: 3, pointerEvents: 'none', padding: '2px 7px', fontSize: 12, fontVariantNumeric: 'tabular-nums',
  borderRadius: 4, background: 'rgba(17,24,39,0.85)', color: 'white', whiteSpace: 'nowrap',
}

function signed(metres: number): string {
  return `${metres >= 0 ? '+' : '−'}${Math.abs(metres).toFixed(1)}`
}

/**
 * Shift+Z height editing (section 3): with a building selected, Shift+Z turns the camera to its side
 * and the cursor raises or lowers it (the map does not pan). The base follows live; release = one
 * `building.set-ground` (Fixed at the new base; no pad yet → dig only). Esc mid-drag puts it back;
 * Shift+Z or Esc leaves and the camera returns.
 */
export function HeightEditMode({ map, document, sampler, target, dispatch, onDraft, onActive, ensureBuildingLock }: {
  map: maplibregl.Map | null
  document: CampusDocument
  sampler: TerrainSampler | null
  target: HeightEditTarget | null
  dispatch: (command: Command) => MutationResult | undefined
  onDraft: (draft: Draft | null) => void
  onActive: (active: boolean) => void
  ensureBuildingLock: (buildingId: string) => Promise<boolean>
}) {
  const [active, setActive] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [readout, setReadout] = useState<{ x: number; y: number; text: string } | null>(null)
  const latest = useRef({ map, document, sampler, target, dispatch, onDraft, onActive, ensureBuildingLock })
  // Synced before paint, so a Shift+Z right after a selection already sees it.
  useLayoutEffect(() => {
    latest.current = { map, document, sampler, target, dispatch, onDraft, onActive, ensureBuildingLock }
  })
  const saved = useRef<SavedCamera | null>(null)
  const drag = useRef<{ startY: number; startBase: number; base: number; buildingId: string } | null>(null)
  const activeRef = useRef(false)

  // Keys: Shift+Z toggles, Esc cancels a drag or leaves.
  useEffect(() => {
    const building = () => {
      const { document: doc, target: t } = latest.current
      return t ? doc.buildings.find((b) => b.id === t.buildingId) ?? null : null
    }
    const cancelDrag = () => {
      drag.current = null
      setReadout(null)
      latest.current.onDraft(null)
    }
    const enter = () => {
      const m = latest.current.map
      const b = building()
      if (!m || !b) {
        setHint('Select a building or a stair first, then press Shift+Z.')
        window.setTimeout(() => setHint(null), HINT_MS)
        return
      }
      const c = m.getCenter()
      saved.current = { center: { lng: c.lng, lat: c.lat }, zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() }
      const points = b.footprint.points.slice(0, -1)
      const view = sideViewCamera(points.length >= 3 ? points : b.footprint.points, 'building')
      const framed = m.cameraForBounds(view.bounds, { padding: 120, bearing: view.bearing })
      // Aim at the middle of the building's height: the 3D ground switches on during the tilt, so a
      // sea-level aim point would sit inside the hill and the view would stare at the slope in front.
      const s = latest.current.sampler
      const base = s ? effectiveBuildingBase(b, s) : b.baseElevation
      const top = base + Math.max(3.5, ...b.floors.map((f) => f.elevation + (f.height ?? 3.5)))
      const exaggeration = (m.getTerrain?.() as { exaggeration?: number } | null)?.exaggeration ?? 1
      m.easeTo({
        center: framed?.center ?? view.center, zoom: Math.min((framed?.zoom ?? 18.5) - 0.7, 18.5),
        bearing: view.bearing, pitch: SIDE_VIEW_PITCH, elevation: ((base + top) / 2) * exaggeration, duration: 600,
      })
      m.dragPan.disable()
      m.getCanvas().style.cursor = 'ns-resize'
      activeRef.current = true
      setActive(true)
      latest.current.onActive(true)
    }
    const leave = () => {
      const m = latest.current.map
      cancelDrag()
      if (m) {
        if (saved.current) m.easeTo({ ...saved.current, duration: 600 })
        m.dragPan.enable()
        m.getCanvas().style.cursor = ''
      }
      saved.current = null
      activeRef.current = false
      setActive(false)
      latest.current.onActive(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (event.key === 'Escape') {
        if (drag.current) cancelDrag()
        else if (activeRef.current) leave()
        return
      }
      if (event.key.toLowerCase() === 'z' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        if (activeRef.current) leave()
        else enter()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (activeRef.current) {
        const m = latest.current.map
        m?.dragPan.enable()
        if (m) m.getCanvas().style.cursor = ''
      }
    }
  }, [])

  // Dragging while the mode is on.
  useEffect(() => {
    if (!map || !active) return
    const onDown = (event: maplibregl.MapMouseEvent) => {
      if (event.originalEvent.button !== 0) return
      const { document: doc, sampler: s, target: t } = latest.current
      const b = t ? doc.buildings.find((x) => x.id === t.buildingId) : null
      if (!b || !s) return
      event.preventDefault()
      const base = effectiveBuildingBase(b, s)
      drag.current = { startY: event.point.y, startBase: base, base, buildingId: b.id }
      setMessage(null)
    }
    const onMove = (event: maplibregl.MapMouseEvent) => {
      const d = drag.current
      if (!d) return
      const delta = metresForDrag(event.point.y - d.startY, { zoom: map.getZoom(), lat: map.getCenter().lat, pitch: map.getPitch(), fine: event.originalEvent.shiftKey })
      d.base = Math.round((d.startBase + delta) * 10) / 10
      latest.current.onDraft({ buildingBase: { buildingId: d.buildingId, baseM: d.base } })
      setReadout({ x: event.point.x, y: event.point.y, text: `Base ${d.base.toFixed(1)} m (${signed(d.base - d.startBase)})` })
    }
    const onUp = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      setReadout(null)
      const { document: doc, dispatch: run, onDraft: draft, ensureBuildingLock: lock } = latest.current
      if (Math.abs(d.base - d.startBase) < 0.05) {
        draft(null)
        return
      }
      const b = doc.buildings.find((x) => x.id === d.buildingId)
      void lock(d.buildingId).then((granted) => {
        if (!granted) {
          setMessage('Another admin is editing this building.')
        } else {
          const result = run({
            id: 'building.set-ground', label: 'Building height',
            payload: { buildingId: d.buildingId, baseMode: 'fixed', baseElevation: d.base, pad: padAfterLowering(b?.ground?.pad) },
          })
          if (result && result.success === false) setMessage(result.error ?? 'That did not work.')
        }
        draft(null)
      })
    }
    map.on('mousedown', onDown)
    map.on('mousemove', onMove)
    map.on('mouseup', onUp)
    return () => {
      map.off('mousedown', onDown)
      map.off('mousemove', onMove)
      map.off('mouseup', onUp)
    }
  }, [map, active])

  if (!map) return null
  return createPortal(
    <>
      {readout && <div role="status" style={{ ...label, left: `${readout.x + 16}px`, top: `${readout.y - 12}px` }}>{readout.text}</div>}
      {!readout && hint && <div role="status" style={{ ...label, left: '50%', top: 56, transform: 'translateX(-50%)' }}>{hint}</div>}
      {!readout && !hint && active && (
        <div aria-hidden style={{ ...label, left: '50%', top: 56, transform: 'translateX(-50%)', background: 'rgba(37,99,235,0.9)' }}>
          Height mode · drag up or down · Shift = fine · Esc to leave
        </div>
      )}
      {message && <div role="alert" style={{ ...label, left: '50%', top: 88, transform: 'translateX(-50%)', background: '#991b1b' }}>{message}</div>}
    </>,
    map.getContainer(),
  )
}
