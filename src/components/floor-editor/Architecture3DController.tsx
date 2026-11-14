'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as LibreMap } from 'maplibre-gl'
import { buildWallOpeningVolumes, collectFloorDoors } from '@navi/core'
import type { CoordinateTransformer, Floor, Opening, Wall } from '@navi/core'
import { genId } from '@navi/editor'
import type { Command } from '@navi/editor'
import { createArchitectureProjection } from './architecture-3d-projection'
import { intersectWallFace, pickArchitecture, wallFacePoint } from './architecture-3d-math'
import type { ArchitectureHit, ScreenPoint, WallSide } from './architecture-3d-math'
import { captureStillCurrent, isHandleVisible, moveWindow, openingFits, resizeWindow, windowFromDrag } from './architecture-3d-gestures'
import { pickArchitectureAsset } from './architecture-asset-selection'

interface Props {
  map: LibreMap; transformer: CoordinateTransformer; buildingId: string; floor: Floor
  tool: string; selectedId?: string | null; selectedWallId?: string | null
  assetFeatures?: readonly GeoJSON.Feature<GeoJSON.Polygon>[]
  assetSelectionIds?: Record<string, string>
  onSelect(id: string | null): void; onWallSelect(id: string | null): void
  onPreview(floor: Floor | null): void
  execute(command: Command): { success: boolean; error?: string }
}
type Projection = ReturnType<typeof createArchitectureProjection>
interface Drag {
  kind: 'create' | 'move' | 'resize' | 'height'; wall: Wall; opening?: Opening
  start: ArchitectureHit; side: WallSide; corner: number; id: string; pointerId: number
  projection: ReturnType<Projection['capture']>; restore(): void
  candidate?: Opening; height?: number; error?: string
  selectedId?: string | null; selectedWallId?: string | null
}
const controls = ['dragPan', 'dragRotate', 'scrollZoom', 'boxZoom', 'doubleClickZoom', 'keyboard', 'touchZoomRotate'] as const
function otherApertures(floor: Floor): Opening[] {
  return [...(floor.openings ?? []), ...collectFloorDoors(floor).flatMap(door => door.wallAttachment ? [{ id: door.id, type: 'door' as const, wallId: door.wallAttachment.wallId, offset: door.wallAttachment.offset-door.width/2, width: door.width, height: door.wallAttachment.openingHeight, sillHeight: 0 }] : []), ...(floor.windows ?? []).map(w => ({ ...w, type: 'window' as const, height: 1.2 }))]
}

/** Facade-only controller. Legacy ground-plane handlers remain readOnly. */
export function Architecture3DController(props: Props) {
  const latest = useRef(props)
  useEffect(() => { latest.current = props }, [props])
  const drag = useRef<Drag | null>(null)
  const cancelGesture = useRef<(reason?: string) => void>(() => {})
  const [frame, setFrame] = useState<ReturnType<Projection['capture']>>(null)
  const [heightPreview, setHeightPreview] = useState<number | null>(null)
  const [ghost, setGhost] = useState<{ wall: Wall; opening: Opening; side: WallSide; error: string | null } | null>(null)
  const [message, setMessage] = useState('Select a wall or window. Use Window to draw on a wall face.')
  const [side, setSide] = useState<WallSide>(1)
  const { map, transformer, buildingId, floor, tool } = props

  useEffect(() => {
    const adapter = createArchitectureProjection(map, transformer, buildingId)
    const unsubscribe = adapter.subscribe(() => {
      const snapshot = adapter.capture()
      setFrame(snapshot)
      if (!snapshot) cancelGesture.current('The map view is unavailable. Start the edit again.')
    })
    // Handles are siblings of the MapLibre container, so capture on their
    // common canvas wrapper while measuring the map's own CSS viewport.
    const container = map.getContainer().parentElement ?? map.getContainer()
    const screen = (event: PointerEvent): ScreenPoint => {
      const rect = map.getContainer().getBoundingClientRect()
      return { x: event.clientX-rect.left, y: event.clientY-rect.top }
    }
    const cancel = (reason?: string) => {
      const current = drag.current
      drag.current = null
      current?.restore()
      if (current && container.hasPointerCapture?.(current.pointerId)) container.releasePointerCapture(current.pointerId)
      latest.current.onPreview(null)
      setGhost(null)
      setHeightPreview(null)
      if (reason) setMessage(reason)
    }
    cancelGesture.current = cancel
    const cameraCancel = () => cancel(drag.current ? 'View changed. Start the edit again.' : undefined)
    const contextCancel = () => cancel('The map view changed. Start the edit again.')
    const pointerMove = (event: PointerEvent) => {
      const p = latest.current, current = drag.current
      if (current) {
        event.preventDefault(); event.stopPropagation()
        const ray = current.projection?.ray(screen(event))
        const hit = ray && intersectWallFace(ray, current.wall, current.side, false)
        if (!hit) { current.error = 'Rotate the view to face the wall.'; setMessage(current.error); return }
        if (current.kind === 'height') {
          const height = Math.max(.1, hit.z)
          current.height = height
          const candidateWall = { ...current.wall, height }
          const conflict = otherApertures(p.floor).some(o => o.wallId === current.wall.id && (o.sillHeight ?? (o.type === 'door' ? 0 : .9)) + (o.height ?? (o.type === 'door' ? 2.1 : 1.2)) > height+1e-8)
          current.error = conflict ? 'This height cuts through a door or window. Move the opening first.' : undefined
          p.onPreview({ ...p.floor, walls: p.floor.walls?.map(w => w.id === candidateWall.id ? candidateWall : w) })
          setMessage(current.error ?? `Wall height: ${height.toFixed(2)} m`)
          setHeightPreview(height)
          return
        }
        const candidate = current.kind === 'create' ? windowFromDrag(current.id, current.wall, current.start, hit)
          : current.kind === 'move' ? moveWindow(current.opening!, current.start, hit) : resizeWindow(current.opening!, current.corner, hit)
        current.candidate = candidate
        current.error = openingFits(candidate, current.wall, otherApertures(p.floor)) ?? undefined
        setGhost({ wall: current.wall, opening: candidate, side: current.side, error: current.error ?? null })
        if (!current.error) p.onPreview({ ...p.floor, openings: [...(p.floor.openings ?? []).filter(o => o.id !== candidate.id), candidate] })
        else p.onPreview(null)
        setMessage(current.error ?? `${candidate.width.toFixed(2)} x ${(candidate.height ?? 1.2).toFixed(2)} m; sill ${(candidate.sillHeight ?? .9).toFixed(2)} m`)
        return
      }
      if (p.tool !== 'window') return
      const ray = adapter.ray(screen(event))
      const solids = buildWallOpeningVolumes(p.floor.walls ?? [], p.floor.openings ?? [], collectFloorDoors(p.floor), p.floor.windows ?? [], 0).collection
      const hit = ray && pickArchitecture(ray, p.floor.walls ?? [], p.floor.openings ?? [], solids)
      const wall = hit && p.floor.walls?.find(w => w.id === hit.wallId)
      if (!hit?.facade || !wall) { setGhost(null); p.onPreview(null); return }
      const opening: Opening = { id: '__hover__', type: 'window', wallId: wall.id, offset: hit.offset-.6, width: 1.2, height: 1.2, sillHeight: hit.z-.6, windowAppearance: 'fixed' }
      const error = openingFits(opening, wall, otherApertures(p.floor))
      setGhost({ wall, opening, side: hit.side, error })
      p.onPreview(error ? null : { ...p.floor, openings: [...(p.floor.openings ?? []), opening] })
      setMessage(error ?? 'Drag diagonally on this wall to size a window. Escape cancels.')
    }
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || drag.current) return
      const p = latest.current
      if (!['select','window','wall'].includes(p.tool)) return
      const target = event.target instanceof Element ? event.target.closest('[data-architecture-handle]') : null
      const ray = adapter.ray(screen(event))
      if (!ray) { setMessage('Rotate the view to face the wall; projection is not ready.'); return }
      const solids = buildWallOpeningVolumes(p.floor.walls ?? [], p.floor.openings ?? [], collectFloorDoors(p.floor), p.floor.windows ?? [], 0).collection
      let hit = pickArchitecture(ray, p.floor.walls ?? [], p.floor.openings ?? [], solids)
      if (!target && p.tool === 'select') {
        const asset = pickArchitectureAsset(ray, p.assetFeatures ?? [], hit?.distance ?? Infinity)
        if (asset) {
          event.preventDefault(); event.stopPropagation()
          p.onSelect(p.assetSelectionIds?.[asset.id] ?? asset.id); p.onWallSelect(null)
          return
        }
      }
      let wall = hit && p.floor.walls?.find(w => w.id === hit.wallId)
      let opening: Opening | undefined
      let kind: Drag['kind'] | undefined
      let corner = -1
      if (target) {
        // A stale overlay must not bypass a nearer solid after camera changes.
        const targetWallId = target.getAttribute('data-wall-id')
        const targetOpeningId = target.getAttribute('data-opening-id')
        if (hit && (targetOpeningId ? hit.openingId !== targetOpeningId && hit.wallId !== targetWallId : hit.wallId !== targetWallId)) return
        kind = target.getAttribute('data-architecture-handle') as Drag['kind']
        wall = p.floor.walls?.find(w => w.id === target.getAttribute('data-wall-id'))
        opening = p.floor.openings?.find(o => o.id === target.getAttribute('data-opening-id'))
        corner = Number(target.getAttribute('data-corner') ?? -1)
        const handleSide = Number(target.getAttribute('data-side') ?? 1) as WallSide
        hit = wall && intersectWallFace(ray, wall, handleSide, false)
        const nearest = pickArchitecture(ray, p.floor.walls ?? [], p.floor.openings ?? [], solids)
        if (hit && !isHandleVisible(hit.point, ray, nearest)) return
      } else if (hit && wall) {
        if (p.tool === 'window' && hit.facade) kind = 'create'
        else {
          p.onSelect(p.tool === 'select' ? hit.openingId ?? null : null)
          p.onWallSelect(hit.openingId && p.tool === 'select' ? null : wall.id)
          setSide(hit.side)
        }
      } else { p.onSelect(null); p.onWallSelect(null) }
      if (!hit || !wall || !kind) return
      if ((kind === 'move' || kind === 'resize') && !opening) return
      const captured = adapter.capture()
      if (!captured) return
      event.preventDefault(); event.stopPropagation()
      const states = controls.map(key => [key, map[key].isEnabled()] as const)
      states.forEach(([key]) => map[key].disable())
      const restore = () => states.forEach(([key, enabled]) => { if (enabled) map[key].enable(); else map[key].disable() })
      drag.current = { kind, wall: structuredClone(wall), opening: opening && structuredClone(opening), start: hit, side: hit.side, corner, id: kind === 'create' ? genId('opening') : opening?.id ?? wall.id, pointerId: event.pointerId, projection: captured, restore, selectedId: p.selectedId, selectedWallId: p.selectedWallId }
      container.setPointerCapture(event.pointerId)
      setSide(hit.side)
    }
    const pointerUp = (event: PointerEvent) => {
      const current = drag.current
      if (!current || current.pointerId !== event.pointerId) return
      event.preventDefault(); event.stopPropagation()
      const p = latest.current
      if (!adapter.capture()) { cancel('The map view is unavailable. Start the edit again.'); return }
      const currentWall = p.floor.walls?.find(w => w.id === current.wall.id)
      const currentOpening = current.opening && p.floor.openings?.find(o => o.id === current.opening!.id)
      if (!captureStillCurrent(current.wall, current.opening, currentWall, currentOpening)) { cancel('The wall or window changed. Start the edit again.'); return }
      if (current.error) { const error = current.error; cancel(error); return }
      let command: Command | null = null
      if (current.kind === 'height' && current.height !== undefined && current.height !== current.wall.height) command = { id: 'wall.update', label: 'Resize wall height', payload: { buildingId, floorId: p.floor.id, wallId: current.wall.id, patch: { height: current.height } } }
      else if (current.candidate) {
        const candidate = current.candidate
        if (current.kind === 'create') command = { id: 'opening.create', label: 'Place window on wall', payload: { buildingId, floorId: p.floor.id, opening: candidate } }
        else if (JSON.stringify(candidate) !== JSON.stringify(current.opening)) command = { id: 'opening.update', label: 'Adjust window on wall', payload: { openingId: candidate.id, patch: { offset: candidate.offset, width: candidate.width, height: candidate.height, sillHeight: candidate.sillHeight } } }
      }
      cancel()
      if (!command) return
      try {
        const result = p.execute(command)
        setMessage(result.success ? 'Draft updated. Undo reverses this edit.' : result.error ?? 'The edit was refused. Adjust the dimensions and try again.')
        if (result.success && current.kind !== 'height') { p.onSelect(current.id); p.onWallSelect(null) }
      } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The edit was refused.') }
    }
    const pointerCancel = () => cancel('Edit cancelled.')
    const pointerLeave = () => { if (!drag.current) cancel() }
    const keyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); cancel('Edit cancelled.') } }
    container.addEventListener('pointerdown', pointerDown, true)
    container.addEventListener('pointermove', pointerMove, true)
    container.addEventListener('pointerup', pointerUp, true)
    container.addEventListener('pointercancel', pointerCancel, true)
    container.addEventListener('pointerleave', pointerLeave)
    window.addEventListener('keydown', keyDown)
    map.on('movestart', cameraCancel); map.on('style.load', contextCancel); map.on('webglcontextlost', contextCancel)
    return () => {
      cancel(); unsubscribe(); adapter.dispose()
      container.removeEventListener('pointerdown', pointerDown, true); container.removeEventListener('pointermove', pointerMove, true)
      container.removeEventListener('pointerup', pointerUp, true); container.removeEventListener('pointercancel', pointerCancel, true)
      container.removeEventListener('pointerleave', pointerLeave)
      window.removeEventListener('keydown', keyDown)
      map.off('movestart', cameraCancel); map.off('style.load', contextCancel); map.off('webglcontextlost', contextCancel)
    }
  }, [map, transformer, buildingId, floor.id, tool])

  // Document changes can arrive during a gesture without a pointer event.
  useEffect(() => {
    const current = drag.current
    if (current && (current.selectedId !== props.selectedId || current.selectedWallId !== props.selectedWallId || !captureStillCurrent(current.wall, current.opening, floor.walls?.find(w => w.id === current.wall.id), current.opening && floor.openings?.find(o => o.id === current.opening!.id)))) {
      cancelGesture.current('The wall or window selection changed. Start the edit again.')
    }
  }, [floor, props])

  const project = (wall: Wall, offset: number, z: number, face = side) => {
    const local = wallFacePoint(wall, offset, z, face)
    return local && frame?.project(local)
  }
  const selected = floor.openings?.find(o => o.id === props.selectedId && o.type === 'window')
  const selectedWall = floor.walls?.find(w => w.id === (selected?.wallId ?? props.selectedWallId))
  const handleSolids = buildWallOpeningVolumes(floor.walls ?? [], floor.openings ?? [], collectFloorDoors(floor), floor.windows ?? [], 0).collection
  const visibleHandle = (wall: Wall, offset: number, z: number) => {
    const local = wallFacePoint(wall, offset, z, side), screen = project(wall, offset, z)
    if (!local || !screen) return null
    const ray = frame?.ray(screen) ?? null
    const nearest = ray && pickArchitecture(ray, floor.walls ?? [], floor.openings ?? [], handleSolids)
    return isHandleVisible(local, ray, nearest) ? screen : null
  }
  const handles: { point: ScreenPoint; kind: Drag['kind']; corner?: number; wallId: string; openingId?: string }[] = []
  if (selected && selectedWall) {
    const z = selected.sillHeight ?? .9, h = selected.height ?? 1.2
    ;[[selected.offset,z],[selected.offset+selected.width,z],[selected.offset+selected.width,z+h],[selected.offset,z+h]].forEach(([offset,height], corner) => {
      const point = visibleHandle(selectedWall, offset, height)
      if (point) handles.push({ point, kind: 'resize', corner, wallId: selectedWall.id, openingId: selected.id })
    })
    const point = visibleHandle(selectedWall, selected.offset+selected.width/2, z+h/2)
    if (point) handles.push({ point, kind: 'move', wallId: selectedWall.id, openingId: selected.id })
  } else if (selectedWall) {
    const point = visibleHandle(selectedWall, Math.hypot(selectedWall.end.x-selectedWall.start.x,selectedWall.end.y-selectedWall.start.y)/2, heightPreview ?? selectedWall.height)
    if (point) handles.push({ point, kind: 'height', wallId: selectedWall.id })
  }
  let ghostPoints = ''
  if (ghost) {
    const { wall, opening: o, side: face } = ghost
    const z = o.sillHeight ?? .9, h = o.height ?? 1.2
    const points = [[o.offset,z],[o.offset+o.width,z],[o.offset+o.width,z+h],[o.offset,z+h]].map(([offset,height]) => project(wall, offset, height, face))
    if (points.every(Boolean)) ghostPoints = points.map(p => `${p!.x},${p!.y}`).join(' ')
  }
  return <>
    <svg aria-label="Architecture 2.5D controls" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 8, overflow: 'hidden' }}>
      {ghostPoints && <polygon points={ghostPoints} fill={ghost?.error ? '#ef444440' : '#38bdf840'} stroke={ghost?.error ? '#ef4444' : '#0284c7'} strokeWidth="2" />}
      {handles.map(handle => <g key={handle.kind+':'+handle.corner}>
        <circle data-architecture-handle={handle.kind} data-wall-id={handle.wallId} data-opening-id={handle.openingId} data-corner={handle.corner} data-side={side}
          aria-label={handle.kind === 'height' ? 'Drag wall height' : handle.kind === 'move' ? 'Move window' : `Resize window corner ${handle.corner!+1}`}
          cx={handle.point.x} cy={handle.point.y} r={handle.kind === 'height' ? 13 : 9} fill="#fff" stroke="#0284c7" strokeWidth="2" style={{ pointerEvents: 'all', cursor: handle.kind === 'height' ? 'ns-resize' : 'move' }} />
        {handle.kind === 'height' && <text x={handle.point.x} y={handle.point.y+4} textAnchor="middle" fill="#0284c7" style={{ fontSize: 18, pointerEvents: 'none' }}>&#8597;</text>}
      </g>)}
    </svg>
    <div role="status" data-testid="architecture-3d-status" style={{ position: 'absolute', left: 12, bottom: 18, maxWidth: 'calc(100% - 24px)', padding: '8px 12px', borderRadius: 6, background: '#0f172a', color: '#f8fafc', fontSize: 12, pointerEvents: 'none', zIndex: 9 }}>{message}</div>
  </>
}
