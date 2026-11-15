'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import {
  createTerrainSampler, insertLine, levelMesh, meshPointXY, newMesh, setMeshMode, slideLine, toLatLng, toLocal,
  type CampusDocument, type TerrainMesh, type TerrainSampler,
} from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'
import { dragHeight, openSession, pointHeights, selectAt, selectBox, sessionCommand, typeHeight, type MeshSelectMode, type MeshSession } from '@/lib/terrain/mesh-session'
import { meshLineSlice } from '@/lib/terrain/profile-slice'
import { ProfileStrip } from '../ProfileStrip'

/**
 * Mesh tool (owner 2026-11-15): lasso an area, Make mesh, then shape it — select a Point, a Row, a Column or a Box,
 * raise or lower it (or type a height, or drag it in the side view), slide a line, add lines, Keep bumps or Smooth
 * out. The ground follows live (the draft goes to the terrain sampler); Confirm saves it as one undo step.
 */
const SOURCE = 'mesh-sheet'
const LAYERS = ['mesh-sheet-fill', 'mesh-sheet-outline', 'mesh-sheet-lines', 'mesh-sheet-points', 'mesh-sheet-labels'] as const
const STEP_M = 0.5
type LatLng = { lat: number; lng: number }

export interface MeshToolProps {
  map: maplibregl.Map | null
  document: CampusDocument
  sampler: TerrainSampler | null
  active: boolean
  /** The lasso drawn so far (the terrain editor draws it while no mesh is open). */
  lassoPoints: LatLng[]
  onLassoReset: () => void
  dispatch: (command: Command) => MutationResult | undefined
  /** The mesh being edited (or null): the terrain sampler shows it live. */
  onDraft: (mesh: TerrainMesh | null) => void
  /** Open this saved mesh (from the Terrain list). */
  requestedMeshId?: string | null
  onSessionChange?: (open: boolean) => void
}

const button: React.CSSProperties = { padding: '3px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--navi-border, #d1d5db)', background: 'var(--navi-card, #fff)', cursor: 'pointer' }
const chosen: React.CSSProperties = { ...button, border: '1px solid #534AB7', background: '#EEEDFE', color: '#3C3489' }

function sheetData(mesh: TerrainMesh, session: MeshSession, grid: { originLat: number; originLng: number }, heights: number[]): GeoJSON.FeatureCollection {
  const ll = (row: number, col: number) => {
    const p = toLatLng(grid, meshPointXY(mesh, grid as never, row, col))
    return [p.lng, p.lat]
  }
  const ring = mesh.outline.map((p) => [p.lng, p.lat])
  const features: GeoJSON.Feature[] = [{ type: 'Feature', properties: { kind: 'outline' }, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } }]
  mesh.rowsAt.forEach((_, row) => features.push({ type: 'Feature', properties: { kind: 'line', axis: 'row', index: row }, geometry: { type: 'LineString', coordinates: mesh.colsAt.map((__, col) => ll(row, col)) } }))
  mesh.colsAt.forEach((_, col) => features.push({ type: 'Feature', properties: { kind: 'line', axis: 'col', index: col }, geometry: { type: 'LineString', coordinates: mesh.rowsAt.map((__, row) => ll(row, col)) } }))
  const picked = new Set(session.selected.map((c) => `${c.row}:${c.col}`))
  const cols = mesh.colsAt.length
  heights.forEach((h, i) => {
    const row = Math.floor(i / cols)
    const col = i % cols
    features.push({ type: 'Feature', properties: { kind: 'point', row, col, selected: picked.has(`${row}:${col}`), label: `${h.toFixed(1)} m` }, geometry: { type: 'Point', coordinates: ll(row, col) } })
  })
  return { type: 'FeatureCollection', features }
}

export function MeshTool({ map, document, sampler, active, lassoPoints, onLassoReset, dispatch, onDraft, requestedMeshId, onSessionChange }: MeshToolProps) {
  const grid = document.terrain?.grid ?? null
  const [session, setSession] = useState<MeshSession | null>(null)
  const [picking, setPicking] = useState(false)
  const [typed, setTyped] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const latest = useRef({ session, picking, sampler })
  latest.current = { session, picking, sampler }

  // The ground under the mesh being edited: everything below it in the list (never the mesh itself).
  const below = useMemo(() => {
    if (!session) return null
    const list = document.terrain?.meshes ?? []
    const at = list.findIndex((m) => m.id === session.draft.id)
    return createTerrainSampler(document, { meshesOverride: at < 0 ? list : list.slice(0, at), studioView: true })
    // Re-read only when another mesh opens or the document changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, session?.draft.id])
  const groundBelowAt = (x: number, y: number) => below?.groundAt(x, y) ?? 0

  useEffect(() => { onDraft(session?.draft ?? null) }, [session, onDraft])
  // Leaving the tool (or losing editing) cancels the open edit: nothing is saved and the preview goes away.
  useEffect(() => {
    if (!active) setSession(null)
  }, [active])
  useEffect(() => { onSessionChange?.(session !== null) }, [session, onSessionChange])
  useEffect(() => {
    if (!requestedMeshId) return
    // `id#token`: the same mesh can be opened again from the list.
    const id = requestedMeshId.split('#')[0]
    const mesh = document.terrain?.meshes?.find((m) => m.id === id)
    if (mesh) setSession(openSession(mesh, false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedMeshId])

  // The sheet on the map: outline (tinted while editing), lines, points with their heights.
  useEffect(() => {
    if (!map || !grid || !session || !active) return
    const heights = pointHeights(session.draft, grid, groundBelowAt)
    const data = sheetData(session.draft, session, grid, heights)
    try {
      const source = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined
      if (source) source.setData(data)
      else map.addSource(SOURCE, { type: 'geojson', data })
      if (!map.getLayer(LAYERS[0])) {
        map.addLayer({ id: LAYERS[0], type: 'fill', source: SOURCE, filter: ['==', ['get', 'kind'], 'outline'], paint: { 'fill-color': '#7F77DD', 'fill-opacity': 0.12 } })
        map.addLayer({ id: LAYERS[1], type: 'line', source: SOURCE, filter: ['==', ['get', 'kind'], 'outline'], paint: { 'line-color': '#D85A30', 'line-width': 1.5, 'line-dasharray': [3, 2] } })
        map.addLayer({ id: LAYERS[2], type: 'line', source: SOURCE, filter: ['==', ['get', 'kind'], 'line'], paint: { 'line-color': '#534AB7', 'line-width': 1.2 } })
        map.addLayer({ id: LAYERS[3], type: 'circle', source: SOURCE, filter: ['==', ['get', 'kind'], 'point'], paint: { 'circle-radius': ['case', ['get', 'selected'], 7, 5], 'circle-color': ['case', ['get', 'selected'], '#534AB7', '#ffffff'], 'circle-stroke-color': '#3C3489', 'circle-stroke-width': 2 } })
        map.addLayer({ id: LAYERS[4], type: 'symbol', source: SOURCE, filter: ['==', ['get', 'kind'], 'point'], layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, -1.3] }, paint: { 'text-color': '#26215C', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } })
      }
    } catch { /* style not ready */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, grid, session, active])
  useEffect(() => {
    if (!map) return
    return () => {
      try {
        for (const id of [...LAYERS].reverse()) if (map.getLayer(id)) map.removeLayer(id)
        if (map.getSource(SOURCE)) map.removeSource(SOURCE)
      } catch { /* the map was already removed */ }
    }
  }, [map])
  useEffect(() => {
    if (!map || session) return
    try {
      for (const id of [...LAYERS].reverse()) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(SOURCE)) map.removeSource(SOURCE)
    } catch { /* the map was already removed */ }
  }, [map, session])

  // Map clicks: pick a height, or select the point under the cursor.
  useEffect(() => {
    if (!map || !active) return
    const onClick = (event: maplibregl.MapMouseEvent) => {
      const { session: s, picking: p, sampler: smp } = latest.current
      if (!s || !grid) return
      if (p && smp) {
        const q = toLocal(grid, event.lngLat)
        setSession(typeHeight(s, grid, groundBelowAt, Math.round(smp.heightAt(q.x, q.y) * 100) / 100))
        setPicking(false)
        return
      }
      const hit = map.queryRenderedFeatures(event.point, { layers: [LAYERS[3]] })[0]
      if (hit) pick({ row: Number(hit.properties?.row), col: Number(hit.properties?.col) }, event.originalEvent.shiftKey)
    }
    map.on('click', onClick)
    return () => { try { map.off('click', onClick) } catch { /* removed */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, active, grid])

  if (!active || !grid) return null

  const pick = (cell: { row: number; col: number }, additive: boolean) => {
    setSession((s) => {
      if (!s) return s
      if (s.mode === 'box' && s.selected.length > 0) {
        const anchor = s.selected[s.selected.length - 1]
        return selectBox(s, [anchor.row, cell.row], [anchor.col, cell.col], additive)
      }
      return selectAt(s, cell, additive)
    })
  }
  const update = (next: (s: MeshSession) => MeshSession) => setSession((s) => (s ? next(s) : s))
  const close = () => { setSession(null); setPicking(false); setTyped(''); setMessage(null) }

  if (!session) {
    return (
      <div style={panelStyle} aria-label="Mesh">
        <strong style={{ fontSize: 13 }}>Mesh</strong>
        <p style={hint}>Click points on the map around the area to shape. Nothing outside it will change.</p>
        {lassoPoints.length >= 3 && (
          <button type="button" style={button} onClick={() => {
            setSession(openSession(newMesh(`mesh-${Date.now().toString(36)}`, `Mesh ${(document.terrain?.meshes?.length ?? 0) + 1}`, lassoPoints, grid), true))
            onLassoReset()
          }}>Make mesh</button>
        )}
      </div>
    )
  }

  const mesh = session.draft
  const cols = mesh.colsAt.length
  const heights = pointHeights(mesh, grid, groundBelowAt)
  const singleLine = (() => {
    if (session.selected.length === 0) return null
    const rows = new Set(session.selected.map((c) => c.row))
    const colsSel = new Set(session.selected.map((c) => c.col))
    if (rows.size === 1 && colsSel.size === cols) return { axis: 'row' as const, index: [...rows][0] }
    if (colsSel.size === 1 && rows.size === mesh.rowsAt.length) return { axis: 'col' as const, index: [...colsSel][0] }
    return null
  })()
  const slice = singleLine ? meshLineSlice(mesh, singleLine.axis, singleLine.index, grid, groundBelowAt, (x, y) => sampler?.heightAt(x, y) ?? 0) : null
  const modes: Array<[MeshSelectMode, string]> = [['point', 'Point'], ['row', 'Row'], ['col', 'Column'], ['box', 'Box']]
  const addLine = (axis: 'row' | 'col') => update((s) => {
    const lines = axis === 'row' ? s.draft.rowsAt : s.draft.colsAt
    let gap = 0
    for (let i = 1; i < lines.length; i++) if (lines[i] - lines[i - 1] > lines[gap + 1] - lines[gap]) gap = i - 1
    return { ...s, draft: insertLine(s.draft, axis, (lines[gap] + lines[gap + 1]) / 2), selected: [] }
  })

  return (
    <div style={panelStyle} aria-label="Mesh">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>{mesh.name}</strong>
        <span style={hint}>{mesh.rowsAt.length} × {cols} lines</span>
      </div>
      <div style={row}>
        <span style={hint}>Select</span>
        {modes.map(([mode, label]) => (
          <button key={mode} type="button" aria-pressed={session.mode === mode} style={session.mode === mode ? chosen : button} onClick={() => update((s) => ({ ...s, mode }))}>{label}</button>
        ))}
      </div>
      <div role="grid" aria-label="Mesh points" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 18px)`, gap: 3 }}>
        {heights.map((h, i) => {
          const r = Math.floor(i / cols)
          const c = i % cols
          const on = session.selected.some((p) => p.row === r && p.col === c)
          return <button key={i} type="button" aria-label={`Select point ${r + 1}, ${c + 1}`} title={`${h.toFixed(2)} m`} onClick={(e) => pick({ row: r, col: c }, e.shiftKey)}
            style={{ width: 18, height: 18, borderRadius: '50%', padding: 0, border: '2px solid #3C3489', background: on ? '#534AB7' : '#fff', cursor: 'pointer' }} />
        })}
      </div>
      <span style={hint}>Selected: {session.selected.length} points</span>
      <div style={row}>
        <button type="button" style={button} aria-label="Raise selected" onClick={() => update((s) => dragHeight(s, grid, STEP_M))}>▲</button>
        <button type="button" style={button} aria-label="Lower selected" onClick={() => update((s) => dragHeight(s, grid, -STEP_M))}>▼</button>
        <label style={field}>Height (m)
          <input type="number" step={0.1} value={typed} onChange={(e) => setTyped(e.target.value)} style={{ width: 64 }}
            onKeyDown={(e) => { if (e.key === 'Enter' && typed !== '') update((s) => typeHeight(s, grid, groundBelowAt, Number(typed))) }} />
        </label>
        <button type="button" style={button} onClick={() => typed !== '' && update((s) => typeHeight(s, grid, groundBelowAt, Number(typed)))}>Set</button>
        <button type="button" style={picking ? chosen : button} onClick={() => setPicking((p) => !p)}>Pick from map</button>
      </div>
      {singleLine && (
        <div style={row}>
          <button type="button" style={button} aria-label="Slide line back" onClick={() => update((s) => ({ ...s, draft: slideLine(s.draft, singleLine.axis, singleLine.index, (singleLine.axis === 'row' ? s.draft.rowsAt : s.draft.colsAt)[singleLine.index] - 1) }))}>◀ Slide</button>
          <button type="button" style={button} aria-label="Slide line forward" onClick={() => update((s) => ({ ...s, draft: slideLine(s.draft, singleLine.axis, singleLine.index, (singleLine.axis === 'row' ? s.draft.rowsAt : s.draft.colsAt)[singleLine.index] + 1) }))}>Slide ▶</button>
        </div>
      )}
      <div style={row}>
        <button type="button" style={button} onClick={() => addLine('row')}>+ Row</button>
        <button type="button" style={button} onClick={() => addLine('col')}>+ Column</button>
        <label style={field}>Soft (m)<input type="number" min={0} max={30} value={mesh.softM} style={{ width: 52 }} onChange={(e) => update((s) => ({ ...s, draft: { ...s.draft, softM: Math.max(0, Math.min(30, Number(e.target.value) || 0)) } }))} /></label>
        <label style={field}>Edge width (m)<input type="number" min={0} max={30} value={mesh.edgeWidthM} style={{ width: 52 }} onChange={(e) => update((s) => ({ ...s, draft: { ...s.draft, edgeWidthM: Math.max(0, Math.min(30, Number(e.target.value) || 0)) } }))} /></label>
      </div>
      <div style={row}>
        <button type="button" aria-pressed={mesh.mode === 'keep-bumps'} style={mesh.mode === 'keep-bumps' ? chosen : button} onClick={() => update((s) => ({ ...s, draft: setMeshMode(s.draft, 'keep-bumps', groundBelowAt, grid) }))}>Keep bumps</button>
        <button type="button" aria-pressed={mesh.mode === 'smooth'} style={mesh.mode === 'smooth' ? chosen : button} onClick={() => update((s) => ({ ...s, draft: setMeshMode(s.draft, 'smooth', groundBelowAt, grid) }))}>Smooth out</button>
        <button type="button" style={button} onClick={() => {
          const level = typed !== '' ? Number(typed) : heights.reduce((t, h) => t + h, 0) / heights.length
          update((s) => ({ ...s, draft: levelMesh(s.draft, Math.round(level * 100) / 100, groundBelowAt, grid) }))
        }}>Level all</button>
      </div>
      {slice && (
        <ProfileStrip title={`Side view · ${singleLine!.axis === 'row' ? 'row' : 'column'} ${singleLine!.index + 1}`} slice={slice}
          onDragHandle={(key, h) => {
            const [r, c] = key.split(':').map(Number)
            // Only that point moves; the line stays selected.
            update((s) => ({ ...s, draft: typeHeight({ ...s, selected: [{ row: r, col: c }] }, grid, groundBelowAt, h).draft }))
          }} />
      )}
      {message && <span role="alert" style={{ fontSize: 12, color: '#991b1b' }}>{message}</span>}
      <div style={row}>
        <button type="button" style={{ ...button, background: '#2563eb', color: '#fff', border: '1px solid #2563eb' }} onClick={() => {
          const command = sessionCommand(session)
          if (command) {
            const result = dispatch(command)
            if (result && result.success === false) { setMessage(result.error ?? 'The mesh could not be saved.'); return }
          }
          close()
        }}>Confirm</button>
        <button type="button" style={button} onClick={close}>Cancel</button>
        {session.original && (
          <button type="button" style={{ ...button, color: '#b91c1c' }} onClick={() => {
            const result = dispatch({ id: 'terrain.mesh.remove', label: 'Delete mesh', payload: { meshId: mesh.id } })
            if (result && result.success === false) { setMessage(result.error ?? 'The mesh could not be deleted.'); return }
            close()
          }}>Delete mesh</button>
        )}
      </div>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  position: 'absolute', right: 12, top: 56, zIndex: 3, width: 300, display: 'flex', flexDirection: 'column', gap: 8, padding: 12,
  background: 'var(--navi-card, #fff)', border: '1px solid var(--navi-border, #e5e7eb)', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.15)', fontSize: 12,
}
const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }
const field: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }
const hint: React.CSSProperties = { fontSize: 11, color: 'var(--navi-text-secondary, #6b7280)' }
