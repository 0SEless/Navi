'use client'

import { useEffect, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { alongOf, pointAlong, roadGradeProfile, toLatLng, toLocal, type CampusDocument, type GroundFit, type Road, type TerrainGrid, type TerrainSampler } from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'
import { roadSlice } from '@/lib/terrain/profile-slice'
import { ProfileStrip } from '../ProfileStrip'

/**
 * Grade tool (owner 2026-11-15): click a road, then grade the ground under it — Grade ground (Off / Raise only /
 * Lower only / Raise and lower), Edge width, Smooth ↔ Follow hill, and height pins along it. Each change is one
 * undo step (road.set-grade); the side view shows the road from the side.
 */
const MODES: Array<[GroundFit['mode'], string]> = [['off', 'Off'], ['raise', 'Raise only'], ['lower', 'Lower only'], ['both', 'Raise and lower']]
type Pin = { alongM: number; heightM: number }

export interface GradeToolProps {
  map: maplibregl.Map | null
  document: CampusDocument
  sampler: TerrainSampler | null
  active: boolean
  dispatch: (command: Command) => MutationResult | undefined
  /** Select this road (from the Terrain list). */
  requestedRoadId?: string | null
}

export function GradeTool({ map, document, sampler, active, dispatch, requestedRoadId }: GradeToolProps) {
  const grid = document.terrain?.grid ?? null
  const [roadId, setRoadId] = useState<string | null>(requestedRoadId ? requestedRoadId.split('#')[0] : null)
  const [message, setMessage] = useState<string | null>(null)
  const latest = useRef({ document, grid, roadId })
  latest.current = { document, grid, roadId }
  // Set each render once a road is open: places a pin at a distance along it (a click on that road).
  const placePin = useRef<((alongM: number) => void) | null>(null)
  // `id#token`: the same road can be opened again from the list.
  useEffect(() => { if (requestedRoadId) setRoadId(requestedRoadId.split('#')[0]) }, [requestedRoadId])

  // Click a road: the nearest centreline within its half width.
  useEffect(() => {
    if (!map || !active) return
    const onClick = (event: maplibregl.MapMouseEvent) => {
      const { document: d, grid: g } = latest.current
      if (!g) return
      const p = toLocal(g, event.lngLat)
      let best: { id: string; distance: number; along: number } | null = null
      for (const r of d.roads ?? []) {
        const line = (r.polyline?.points ?? []).map((q) => toLocal(g, q))
        if (line.length < 2) continue
        const { distance, along } = alongOf(line, p)
        if (distance <= (r.width ?? 0) / 2 + 1 && (!best || distance < best.distance)) best = { id: r.id, distance, along }
      }
      // A click on the open road places a pin exactly there; a click on another road opens that one.
      if (best && best.id === latest.current.roadId && placePin.current) placePin.current(best.along)
      else setRoadId(best?.id ?? null)
    }
    map.on('click', onClick)
    return () => { try { map.off('click', onClick) } catch { /* removed */ } }
  }, [map, active])

  const openRoad = active && grid ? (document.roads ?? []).find((r) => r.id === roadId) ?? null : null
  const pinFeatures = openRoad && grid ? pinsOnMap(openRoad, grid) : null
  const pinKey = JSON.stringify(pinFeatures)
  useEffect(() => {
    if (!map) return
    const data: GeoJSON.FeatureCollection = pinFeatures ?? { type: 'FeatureCollection', features: [] }
    try {
      const source = map.getSource(PIN_SOURCE) as maplibregl.GeoJSONSource | undefined
      if (source) source.setData(data)
      else {
        map.addSource(PIN_SOURCE, { type: 'geojson', data })
        map.addLayer({ id: PIN_DOT, type: 'circle', source: PIN_SOURCE, paint: { 'circle-radius': 6, 'circle-color': '#534AB7', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
        map.addLayer({ id: PIN_LABEL, type: 'symbol', source: PIN_SOURCE, layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, -1.4], 'text-allow-overlap': true }, paint: { 'text-color': '#3C3489', 'text-halo-color': '#fff', 'text-halo-width': 1.5 } })
      }
    } catch { /* map removed */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pinKey])
  useEffect(() => () => {
    if (!map) return
    try {
      for (const id of [PIN_LABEL, PIN_DOT]) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(PIN_SOURCE)) map.removeSource(PIN_SOURCE)
    } catch { /* map removed */ }
  }, [map])

  if (!active || !grid) return null
  const road = (document.roads ?? []).find((r) => r.id === roadId) ?? null
  if (!road) {
    return <div style={panelStyle} aria-label="Grade"><strong style={{ fontSize: 13 }}>Grade</strong><p style={hint}>Click a road to grade the ground under it.</p></div>
  }

  const line = (road.polyline?.points ?? []).map((q) => toLocal(grid, q))
  const fit: GroundFit = road.groundFit ?? { mode: 'off', blendMeters: 3 }
  const grade = road.grade ?? { smoothness: 0.5 }
  const pins: Pin[] = grade.pins ?? []
  const length = line.reduce((t, p, i) => (i ? t + Math.hypot(p.x - line[i - 1].x, p.y - line[i - 1].y) : 0), 0)
  const send = (payload: Record<string, unknown>) => {
    const result = dispatch({ id: 'road.set-grade', label: 'Grade road', payload: { roadId: road.id, ...payload } })
    setMessage(result && result.success === false ? result.error ?? 'That did not work.' : null)
  }
  const setPins = (next: Pin[]) => send({ grade: { ...grade, pins: next } })
  const clampAlong = (s: number) => Math.round(Math.max(0, Math.min(length, s)) * 10) / 10
  // A new pin sits on the smooth road line (not the surface, which can still hold a bump under "Raise only"),
  // so adding a pin never changes the road by itself.
  const pinAt = (along: number) => {
    const s = clampAlong(along)
    const smooth = sampler ? roadGradeProfile(line, (x, y) => sampler.groundAt(x, y), { ...grade, pins }, {}).heightAtAlong(s) : 0
    setPins([...pins, { alongM: s, heightM: Math.round(smooth * 100) / 100 }].sort((a, b) => a.alongM - b.alongM))
  }
  placePin.current = fit.mode !== 'off' ? pinAt : null
  const addPin = () => {
    const stops = [0, ...pins.map((p) => p.alongM).sort((a, b) => a - b), length]
    let at = 0
    for (let i = 1; i < stops.length; i++) if (stops[i] - stops[i - 1] > stops[at + 1] - stops[at]) at = i - 1
    pinAt((stops[at] + stops[at + 1]) / 2)
  }
  const slice = fit.mode !== 'off' && sampler ? roadSlice(line, pins, (x, y) => sampler.groundAt(x, y), (x, y) => sampler.heightAt(x, y)) : null

  return (
    <div style={panelStyle} aria-label="Grade">
      <strong style={{ fontSize: 13 }}>{road.name || 'Road'}</strong>
      <label style={field}>Grade ground
        <select aria-label="Grade ground" value={fit.mode} onChange={(e) => {
          const mode = e.target.value as GroundFit['mode']
          send(mode !== 'off' && !road.grade ? { groundFit: { ...fit, mode }, grade: { smoothness: 0.5 } } : { groundFit: { ...fit, mode } })
        }}>
          {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {(fit.mode === 'raise' || fit.mode === 'lower') && (
        <p style={{ ...hint, color: '#92400e' }}>
          {fit.mode === 'raise' ? 'Ground higher than the road stays, so the road follows those bumps.' : 'Ground lower than the road stays, so the road follows those dips.'}
          {' Choose Raise and lower for a flat, even road.'}
        </p>
      )}
      <label style={field}>Edge width (m)
        <input type="range" aria-label="Edge width slider" min={0} max={20} step={0.5} value={fit.blendMeters} style={{ flex: 1 }}
          onChange={(e) => send({ groundFit: { ...fit, blendMeters: Number(e.target.value) } })} />
        <input type="number" min={0} max={20} step={0.5} value={fit.blendMeters} style={{ width: 52 }}
          onChange={(e) => send({ groundFit: { ...fit, blendMeters: Math.max(0, Math.min(20, Number(e.target.value) || 0)) } })} />
      </label>
      <p style={hint}>How far past the road edge the ground blends back into the hill.</p>
      <label style={{ ...field, flexDirection: 'column', alignItems: 'stretch' }}>
        <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>Follow hill</span><span>Smooth</span></span>
        <input type="range" aria-label="Smooth ↔ Follow hill" min={0} max={1} step={0.05} value={grade.smoothness}
          onChange={(e) => send({ grade: { ...grade, smoothness: Number(e.target.value) } })} />
      </label>
      {slice && (
        <ProfileStrip title="Side view · road" slice={slice}
          onDragHandle={(key, h) => {
            const index = Number(key.split(':')[1])
            setPins(pins.map((p, k) => (k === index ? { ...p, heightM: h } : p)))
          }} />
      )}
      {fit.mode !== 'off' && <p style={hint}>Click the road on the map to place a pin exactly there.</p>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" style={{ ...button, flex: 1 }} onClick={addPin}>Add pin</button>
        {pins.length > 0 && <button type="button" style={button} onClick={() => setPins([])}>Remove all pins</button>}
      </div>
      {pins.length > 0 && (
        <div role="group" aria-label="Pins" style={{ maxHeight: 168, overflowY: 'auto', border: '1px solid var(--navi-border, #e5e7eb)', borderRadius: 6 }}>
          <div style={{ ...pinRow, position: 'sticky', top: 0, background: 'var(--navi-card, #fff)', color: 'var(--navi-text-secondary, #6b7280)', fontSize: 11 }}>
            <span>#</span><span>Along (m)</span><span>Height (m)</span><span />
          </div>
          {pins.map((pin, i) => (
            <div key={i} style={pinRow}>
              <span style={{ color: 'var(--navi-text-secondary, #6b7280)' }}>{i + 1}</span>
              <input type="number" step={1} min={0} max={Math.round(length)} aria-label={`Pin position (m) for pin ${i + 1}`} value={pin.alongM} style={cell}
                onChange={(e) => setPins(pins.map((p, k) => (k === i ? { ...p, alongM: clampAlong(Number(e.target.value) || 0) } : p)))} />
              <input type="number" step={0.1} aria-label={`Pin height at ${Math.round(pin.alongM)} m`} value={pin.heightM} style={cell}
                onChange={(e) => setPins(pins.map((p, k) => (k === i ? { ...p, heightM: Number(e.target.value) } : p)))} />
              <button type="button" style={{ ...button, padding: '1px 6px' }} aria-label={`Remove pin at ${Math.round(pin.alongM)} m`} title="Remove pin" onClick={() => setPins(pins.filter((_, k) => k !== i))}>✕</button>
            </div>
          ))}
        </div>
      )}
      {message && <span role="alert" style={{ fontSize: 12, color: '#991b1b' }}>{message}</span>}
    </div>
  )
}

const PIN_SOURCE = 'grade-pins'
const PIN_DOT = 'grade-pins-dot'
const PIN_LABEL = 'grade-pins-label'

/** The open road's pins as map points labelled "distance · height". */
function pinsOnMap(road: Road, grid: TerrainGrid): GeoJSON.FeatureCollection {
  const line = (road.polyline?.points ?? []).map((q) => toLocal(grid, q))
  return {
    type: 'FeatureCollection',
    features: (road.grade?.pins ?? []).map((pin) => {
      const at = toLatLng(grid, pointAlong(line, pin.alongM))
      return { type: 'Feature' as const, properties: { label: `${Math.round(pin.alongM)} m · ${Number(pin.heightM.toFixed(2))} m` }, geometry: { type: 'Point' as const, coordinates: [at.lng, at.lat] } }
    }),
  }
}

const pinRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '20px 1fr 1fr 28px', alignItems: 'center', gap: 6, padding: '2px 6px', fontSize: 12 }
const cell: React.CSSProperties = { width: '100%', minWidth: 0, fontSize: 12 }
const panelStyle: React.CSSProperties = {
  position: 'absolute', right: 12, top: 56, zIndex: 3, width: 300, maxHeight: 'calc(100% - 140px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 12,
  background: 'var(--navi-card, #fff)', border: '1px solid var(--navi-border, #e5e7eb)', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.15)', fontSize: 12,
}
const field: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }
const hint: React.CSSProperties = { fontSize: 11, color: 'var(--navi-text-secondary, #6b7280)' }
const button: React.CSSProperties = { padding: '3px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--navi-border, #d1d5db)', background: 'var(--navi-card, #fff)', cursor: 'pointer' }
