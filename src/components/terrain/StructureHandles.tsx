'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type maplibregl from 'maplibre-gl'
import {
  effectiveBuildingBase, structurePath, structureTopAt, toLatLng, toLocal,
  type CampusDocument, type ResolvedStructure, type Structure, type TerrainSampler,
} from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'
import { projectAtHeight } from '@/lib/three-d/mesh-layer'
import { snapStructureEnd } from '@/lib/terrain/structure-snap'
import { bendHandleAt, dropHandle, stairReadout, type StructureHandle } from '@/lib/terrain/structure-edit'

type Screen = { x: number; y: number }
const LABELS: Record<StructureHandle, string> = {
  start: 'Stair start', end: 'Stair end', bend: 'Stair bend', 'flight-start': 'Flight start', 'flight-end': 'Flight end',
}
const MOVE_PX = 3
/** Shorter on screen than this, a stair shows only its end handles (the others would cover them). */
const DETAIL_PX = 24

/**
 * Drag handles for the selected stair, drawn at their real height (HTML over the map). A drag moves
 * only the handle; the stair changes once, on release (one undo step). Ends snap to a floor slab edge,
 * else a road, else the ground.
 */
export function StructureHandles({ map, document, sampler, structure, resolved, dispatch }: {
  map: maplibregl.Map
  document: CampusDocument
  sampler: TerrainSampler
  structure: Structure
  resolved: ResolvedStructure
  dispatch: (command: Command) => MutationResult | undefined
}) {
  const [, setFrame] = useState(0)
  const [drag, setDrag] = useState<{ handle: StructureHandle; from: Screen; at: Screen; label: string | null } | null>(null)

  // Follow the camera.
  useEffect(() => {
    let raf = 0
    const onRender = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setFrame((n) => n + 1))
    }
    map.on('render', onRender)
    return () => {
      map.off('render', onRender)
      cancelAnimationFrame(raf)
    }
  }, [map])

  const grid = sampler.grid
  const path = structurePath(resolved.start, resolved.end, resolved.bend)
  const readout = stairReadout(structure, resolved)
  const groundHeight = (p: { lat: number; lng: number }) => {
    const q = toLocal(grid, p)
    return sampler.heightAt(q.x, q.y)
  }
  const screenOf = (local: { x: number; y: number }, h: number) => projectAtHeight(map, toLatLng(grid, local), h)

  const startAt = screenOf(resolved.start, resolved.start.h)
  const endAt = screenOf(resolved.end, resolved.end.h)
  // Bend and flight markers first, so the end handles are drawn on top.
  const handles: Array<{ handle: StructureHandle; at: Screen; orphan?: boolean }> = []
  if (Math.hypot(endAt.x - startAt.x, endAt.y - startAt.y) >= DETAIL_PX) {
    handles.push({ handle: 'bend', at: screenOf(bendHandleAt(resolved), (resolved.start.h + resolved.end.h) / 2) })
    if (readout && readout.steps > 0) {
      for (const [handle, s] of [['flight-start', readout.flightStartM], ['flight-end', readout.flightEndM]] as const) {
        handles.push({ handle, at: screenOf(path.at(s).p, structureTopAt(structure, resolved, path.length, s)) })
      }
    }
  }
  handles.push({ handle: 'start', at: startAt, orphan: resolved.orphanStart }, { handle: 'end', at: endAt, orphan: resolved.orphanEnd })

  const local = (event: React.PointerEvent): Screen => {
    const rect = map.getContainer().getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const snap = (handle: StructureHandle, at: Screen) => {
    const ground = map.unproject([at.x, at.y])
    const pointer = { lat: ground.lat, lng: ground.lng }
    if (handle !== 'start' && handle !== 'end') return { pointer, end: undefined }
    const current = structure[handle]
    const end = snapStructureEnd(document, pointer, (p, h) => projectAtHeight(map, p, h), {
      screen: at,
      floorId: current.kind === 'slab' ? current.floorId : null,
      slabHeight: (building, floor) => effectiveBuildingBase(building, sampler) + floor.elevation,
      groundHeight,
    })
    return { pointer, end }
  }
  const labelOf = (handle: StructureHandle, at: Screen): string | null => {
    const { end } = snap(handle, at)
    if (!end) return null
    if (end.kind === 'slab') {
      const building = document.buildings.find((b) => b.id === end.buildingId)
      const floor = building?.floors.find((f) => f.id === end.floorId)
      return `${building?.name ?? 'Building'} · ${floor?.label ?? 'floor'} edge`
    }
    return end.kind === 'road' ? 'Road' : 'Ground'
  }

  const onPointerDown = (handle: StructureHandle) => (event: React.PointerEvent) => {
    event.stopPropagation()
    event.preventDefault()
    ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
    const at = local(event)
    setDrag({ handle, from: at, at, label: null })
  }
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag) return
    const at = local(event)
    setDrag({ ...drag, at, label: labelOf(drag.handle, at) })
  }
  const onPointerUp = (event: React.PointerEvent) => {
    if (!drag) return
    event.stopPropagation()
    const at = local(event)
    setDrag(null)
    if (Math.hypot(at.x - drag.from.x, at.y - drag.from.y) < MOVE_PX) return
    const { pointer, end } = snap(drag.handle, at)
    const next = dropHandle(structure, resolved, grid, drag.handle, { at: pointer, ...(end ? { end } : {}) })
    dispatch({ id: 'structure.replace', label: 'Edit stair', payload: { structure: next } })
  }

  return createPortal(
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
      {handles.map(({ handle, at, orphan }) => {
        const shown = drag?.handle === handle ? drag.at : at
        const end = handle === 'start' || handle === 'end'
        return (
          <div
            key={handle}
            role="button"
            aria-label={LABELS[handle]}
            title={orphan ? 'Its building or floor was removed. Drag it onto a floor edge again.' : LABELS[handle]}
            data-orphan={orphan ? 'true' : undefined}
            onPointerDown={onPointerDown(handle)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={(event) => event.stopPropagation()}
            style={{
              position: 'absolute', left: `${shown.x}px`, top: `${shown.y}px`, transform: 'translate(-50%, -50%)',
              width: end ? 14 : 10, height: end ? 14 : 10, borderRadius: handle === 'bend' ? 2 : '50%', pointerEvents: 'auto', cursor: 'grab',
              background: orphan ? '#dc2626' : end ? '#2563eb' : '#f59e0b', border: '2px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              touchAction: 'none',
            }}
          />
        )
      })}
      {drag?.label && (
        <div style={{ position: 'absolute', left: `${drag.at.x + 12}px`, top: `${drag.at.y - 24}px`, padding: '2px 6px', fontSize: 11, background: 'rgba(17,24,39,0.85)', color: 'white', borderRadius: 4 }}>
          {drag.label}
        </div>
      )}
    </div>,
    map.getContainer(),
  )
}
