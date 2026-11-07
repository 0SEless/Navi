'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type maplibregl from 'maplibre-gl'
import {
  effectiveBuildingBase, resolveStructureEnds, toLatLng,
  type Building, type CampusDocument, type Structure, type TerrainSampler,
} from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'
import { metresForDrag, padAfterLowering, sideViewCamera, SIDE_VIEW_PITCH, stepFloor } from '@/lib/terrain/height-edit'
import { withoutEndHeight } from '@/lib/terrain/structure-edit'
import { projectAtHeight } from '@/lib/three-d/mesh-layer'
import type { TerrainMapProps } from './TerrainMap'
import { isTypingTarget } from './useTerrainShortcuts'

export type HeightEditTarget = { kind: 'building'; buildingId: string } | { kind: 'stair'; structureId: string }
type Draft = NonNullable<TerrainMapProps['draft']>
type LatLng = { lat: number; lng: number }
type SavedCamera = { center: LatLng; zoom: number; bearing: number; pitch: number; clamped: boolean }

/** One drag: the live draft and readout for the dragged metres, then the one command (or nothing). */
interface DragSession {
  startY: number
  move(deltaM: number): { draft: Draft; text: string }
  commit(): { command: Command; lockBuildingId?: string } | null
}

const HINT_MS = 3000
const label: React.CSSProperties = {
  position: 'absolute', zIndex: 3, pointerEvents: 'none', padding: '2px 7px', fontSize: 12, fontVariantNumeric: 'tabular-nums',
  borderRadius: 4, background: 'rgba(17,24,39,0.85)', color: 'white', whiteSpace: 'nowrap',
}

function signed(metres: number): string {
  return `${metres >= 0 ? '+' : '−'}${Math.abs(metres).toFixed(1)}`
}

const round1 = (metres: number) => Math.round(metres * 10) / 10

/** A building: its base follows the drag; release = Fixed at the new base, pad dig only. */
function buildingSession(building: Building, sampler: TerrainSampler, startY: number): DragSession {
  const startBase = effectiveBuildingBase(building, sampler)
  let base = startBase
  return {
    startY,
    move(deltaM) {
      base = round1(startBase + deltaM)
      return { draft: { buildingBase: { buildingId: building.id, baseM: base } }, text: `Base ${base.toFixed(1)} m (${signed(base - startBase)})` }
    },
    commit() {
      if (Math.abs(base - startBase) < 0.05) return null
      return {
        lockBuildingId: building.id,
        command: {
          id: 'building.set-ground', label: 'Building height',
          payload: { buildingId: building.id, baseMode: 'fixed', baseElevation: base, pad: padAfterLowering(building.ground?.pad) },
        },
      }
    },
  }
}

/**
 * A stair end (the one nearest the pointer): a ground/road end gets an offset above (or below) its
 * surface and keeps following it; a floor end steps floor to floor of its building.
 */
function stairSession(document: CampusDocument, structure: Structure, which: 'start' | 'end', startY: number): DragSession | null {
  const end = structure[which]
  const name = which === 'start' ? 'Start' : 'End'
  let next = structure
  const commit = () => (next === structure ? null : { command: { id: 'structure.replace', label: 'Stair height', payload: { structure: next } } })
  if (end.kind === 'slab') {
    const building = document.buildings.find((b) => b.id === end.buildingId)
    if (!building) return null
    return {
      startY,
      move(deltaM) {
        const floorId = stepFloor(building.floors, end.floorId, deltaM)
        next = floorId === end.floorId ? structure : { ...structure, [which]: { ...end, floorId } }
        const floor = building.floors.find((f) => f.id === floorId)
        return { draft: { structure: next }, text: `${name} · ${floor?.label ?? floorId}` }
      },
      commit,
    }
  }
  const surface = end.kind === 'road' ? 'road' : 'ground'
  const startOffset = structure.heightOffset?.[which] ?? 0
  return {
    startY,
    move(deltaM) {
      const offset = round1(startOffset + deltaM)
      // A typed height would hide the offset: Shift+Z clears it, so the end follows its surface again.
      const cleared = withoutEndHeight(structure, which)
      if (offset === startOffset && structure.heightOverride?.[which] === undefined) next = structure
      else if (offset === 0) next = cleared
      else next = { ...cleared, heightOffset: { ...(cleared.heightOffset ?? {}), [which]: offset } }
      const text = offset >= 0
        ? `${name} +${offset.toFixed(1)} m above the ${surface}`
        : `${name} ${Math.abs(offset).toFixed(1)} m below the ${surface}`
      return { draft: { structure: next }, text }
    },
    commit,
  }
}

/**
 * Shift+Z height editing (section 3): with a building or a stair selected, Shift+Z turns the camera to
 * its side and the cursor raises or lowers it (the map does not pan). It follows live; release = one
 * command (building: Fixed at the new base, pad dig only; stair: the nearest end's offset or floor).
 * Esc mid-drag puts it back; Shift+Z or Esc leaves and the camera returns.
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
  const drag = useRef<DragSession | null>(null)
  const activeRef = useRef(false)

  // Keys: Shift+Z toggles, Esc cancels a drag or leaves.
  useEffect(() => {
    /** What the camera looks at from the side, and the height to aim at. */
    const view = (): { points: LatLng[]; kind: 'building' | 'stair'; aimM: number } | null => {
      const { document: doc, sampler: s, target: t } = latest.current
      if (t?.kind === 'building') {
        const b = doc.buildings.find((x) => x.id === t.buildingId)
        if (!b) return null
        // Aim at the middle of the building's height: the 3D ground switches on during the tilt, so a
        // sea-level aim point would sit inside the hill and the view would stare at the slope in front.
        const base = s ? effectiveBuildingBase(b, s) : b.baseElevation
        const top = base + Math.max(3.5, ...b.floors.map((f) => f.elevation + (f.height ?? 3.5)))
        const ring = b.footprint.points.slice(0, -1)
        return { points: ring.length >= 3 ? ring : b.footprint.points, kind: 'building', aimM: (base + top) / 2 }
      }
      if (t?.kind === 'stair' && s) {
        const st = doc.structures?.find((x) => x.id === t.structureId)
        const r = st ? resolveStructureEnds(doc, s, st) : null
        if (!r) return null
        return { points: [toLatLng(s.grid, r.start), toLatLng(s.grid, r.end)], kind: 'stair', aimM: (r.start.h + r.end.h) / 2 }
      }
      return null
    }
    const cancelDrag = () => {
      drag.current = null
      setReadout(null)
      latest.current.onDraft(null)
    }
    const enter = () => {
      const m = latest.current.map
      const v = view()
      if (!m || !v) {
        setHint('Select a building or a stair first, then press Shift+Z.')
        window.setTimeout(() => setHint(null), HINT_MS)
        return
      }
      const c = m.getCenter()
      saved.current = {
        center: { lng: c.lng, lat: c.lat }, zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch(),
        clamped: m.getCenterClampedToGround(),
      }
      // Keep the aim height: MapLibre's ground clamp snaps the aim point to sea level while the 3D ground
      // is still off (measured: aim 0 m with the hall's ground at 33 m, so the hall sat in the top third).
      m.setCenterClampedToGround(false)
      const camera = sideViewCamera(v.points, v.kind)
      const framed = m.cameraForBounds(camera.bounds, { padding: 120, bearing: camera.bearing })
      const exaggeration = (m.getTerrain?.() as { exaggeration?: number } | null)?.exaggeration ?? 1
      const aim = v.aimM * exaggeration
      const turn = {
        center: framed?.center ?? camera.center, zoom: Math.min((framed?.zoom ?? 18.5) - 0.7, 18.5),
        bearing: camera.bearing, pitch: SIDE_VIEW_PITCH, duration: 600,
      }
      m.easeTo(turn)
      // When the turn ends, aim at the object's height (MapLibre's easeTo ignores `elevation` here, and
      // the 3D ground switching on mid-tilt resets it to sea level). Under load MapLibre sometimes ends the
      // ease part-way (measured: stuck at 13°): then jump straight to the side view.
      m.once('moveend', () => {
        if (!activeRef.current) return
        if (Math.abs(m.getPitch() - SIDE_VIEW_PITCH) >= 1) {
          const { duration: _duration, ...view } = turn
          m.jumpTo(view)
        }
        m.setCenterElevation(aim)
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
        if (saved.current) {
          const { clamped, ...camera } = saved.current
          m.setCenterClampedToGround(clamped)
          m.easeTo({ ...camera, duration: 600 })
        }
        m.dragPan.enable()
        m.getCanvas().style.cursor = ''
      }
      saved.current = null
      activeRef.current = false
      setActive(false)
      latest.current.onActive(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
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
        if (m && saved.current) m.setCenterClampedToGround(saved.current.clamped)
      }
    }
  }, [])

  // Dragging while the mode is on.
  useEffect(() => {
    if (!map || !active) return
    const onDown = (event: maplibregl.MapMouseEvent) => {
      if (event.originalEvent.button !== 0) return
      const { document: doc, sampler: s, target: t } = latest.current
      if (!s || !t) return
      let session: DragSession | null = null
      if (t.kind === 'building') {
        const b = doc.buildings.find((x) => x.id === t.buildingId)
        if (b) session = buildingSession(b, s, event.point.y)
      } else {
        const st = doc.structures?.find((x) => x.id === t.structureId)
        const r = st ? resolveStructureEnds(doc, s, st) : null
        if (st && r) {
          // The end nearest the pointer, where it is drawn.
          const at = (p: { x: number; y: number; h: number }) => projectAtHeight(map, toLatLng(s.grid, p), p.h)
          const distance = (q: { x: number; y: number }) => Math.hypot(q.x - event.point.x, q.y - event.point.y)
          session = stairSession(doc, st, distance(at(r.start)) <= distance(at(r.end)) ? 'start' : 'end', event.point.y)
        }
      }
      if (!session) return
      event.preventDefault()
      drag.current = session
      setMessage(null)
    }
    const onMove = (event: maplibregl.MapMouseEvent) => {
      const d = drag.current
      if (!d) return
      const delta = metresForDrag(event.point.y - d.startY, { zoom: map.getZoom(), lat: map.getCenter().lat, pitch: map.getPitch(), fine: event.originalEvent.shiftKey })
      const { draft, text } = d.move(delta)
      latest.current.onDraft(draft)
      setReadout({ x: event.point.x, y: event.point.y, text })
    }
    const onUp = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      setReadout(null)
      const { dispatch: run, onDraft: draft, ensureBuildingLock: lock } = latest.current
      const done = d.commit()
      if (!done) {
        draft(null)
        return
      }
      const apply = () => {
        const result = run(done.command)
        if (result && result.success === false) setMessage(result.error ?? 'That did not work.')
        draft(null)
      }
      // Stairs are free parts; a building needs its lock first.
      if (!done.lockBuildingId) {
        apply()
        return
      }
      void lock(done.lockBuildingId).then((granted) => {
        if (granted) apply()
        else {
          setMessage('Another admin is editing this building.')
          draft(null)
        }
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
