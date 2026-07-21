import { useCallback, useMemo, useState } from 'react'
import type { Building, Floor } from '@navi/core'
import { useEditor, useEditingEngine } from '../../context'
import { Field, inputStyle, selectStyle } from './field'
import { usePublish } from '../workflow/use-publish'
import { FloorManagerDialog } from '../FloorManagerDialog'

interface Props { building: Building }

const sectionHeader: React.CSSProperties = {
  color: '#888',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 1.5,
  borderTop: '1px solid #333',
  paddingTop: 12,
  marginTop: 12,
  marginBottom: 8,
}

const actionBtn: React.CSSProperties = {
  display: 'block',
  width: '100%',
  background: '#1e1e3a',
  color: '#ccc',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
  textAlign: 'left',
  marginBottom: 4,
}

const dangerBtn: React.CSSProperties = {
  ...actionBtn,
  color: '#f14c4c',
  borderColor: '#5c1a1a',
  background: '#2a1010',
}

function floorPlanStatus(floors: Floor[]) {
  return floors.map(f => ({
    id: f.id,
    label: f.label,
    hasPlan: !!f.planImageId,
  }))
}

const BUILD_STATUS_LABELS: Record<string, string> = {
  idle: '',
  preparing: 'Preparing...',
  validating: 'Validating...',
  compiling: 'Compiling...',
  uploading: 'Uploading...',
  success: '',
  error: 'Publish failed',
}

function formatTimestamp(ts: number): string {
  if (!ts) return 'Never'
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function footprintCentroid(points: { lat: number; lng: number }[]): { lat: number; lng: number } | null {
  if (points.length === 0) return null
  const pts = points[0].lat === points[points.length - 1].lat && points[0].lng === points[points.length - 1].lng
    ? points.slice(0, -1) : points
  if (pts.length === 0) return null
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length }
}

export function BuildingProperties({ building }: Props) {
  const { services } = useEditor()
  const editEngine = useEditingEngine()
  const dispatcher = services.get<any>('dispatcher')
  const { snapshot } = usePublish()
  const [showFloorManager, setShowFloorManager] = useState(false)
  const [showPositionEditor, setShowPositionEditor] = useState(false)
  const [positionLat, setPositionLat] = useState('')
  const [positionLng, setPositionLng] = useState('')
  const [positionElevation, setPositionElevation] = useState('')

  const centroid = useMemo(() => footprintCentroid(building.footprint.points), [building.footprint.points])

  const update = useCallback((changes: Record<string, unknown>) => {
    for (const [property, value] of Object.entries(changes)) {
      editEngine.begin({ kind: 'assign', entityId: building.id, property, value })
      editEngine.doCommit()
    }
    dispatcher.execute({ id: 'entity.update', label: 'Edit Building', payload: { entityId: building.id, changes } })
  }, [editEngine, dispatcher, building.id])

  const openPositionEditor = useCallback(() => {
    dispatcher.execute({ id: 'building.adjustPosition', label: 'Adjust Position', payload: { buildingId: building.id } })
    if (centroid) {
      setPositionLat(centroid.lat.toFixed(6))
      setPositionLng(centroid.lng.toFixed(6))
    }
    setPositionElevation(building.baseElevation.toFixed(1))
    setShowPositionEditor(prev => !prev)
  }, [dispatcher, building.id, building.baseElevation, centroid])

  const savePosition = useCallback(() => {
    const lat = parseFloat(positionLat)
    const lng = parseFloat(positionLng)
    const elevation = parseFloat(positionElevation)
    if (isNaN(lat) || isNaN(lng) || isNaN(elevation)) return
    const center = centroid
    if (!center) return
    const newPoints = building.footprint.points.map(p => ({ lat: p.lat + (lat - center.lat), lng: p.lng + (lng - center.lng) }))
    update({ footprint: { points: newPoints }, baseElevation: elevation })
    setShowPositionEditor(false)
  }, [positionLat, positionLng, positionElevation, building.footprint.points, centroid, update])

  const openFloorManager = useCallback(() => {
    dispatcher.execute({ id: 'floor.manage', label: 'Manage Floors', payload: { buildingId: building.id } })
    setShowFloorManager(true)
  }, [dispatcher, building.id])

  const plans = useMemo(() => floorPlanStatus(building.floors), [building.floors])

  const hasPanoramas = useMemo(() =>
    building.floors?.some(f =>
      f.connectorStops?.some(cs => cs.anchors?.some(a => 'imageAssetId' in a && !('code' in a)))
    ), [building.floors])

  const buildStatus = useMemo(() => {
    if (snapshot.publishState === 'success' || (snapshot.publishState === 'idle' && snapshot.lastPublishedAt > 0)) {
      return { label: 'Published', ok: true }
    }
    if (snapshot.publishState === 'error') {
      return { label: 'Publish failed', ok: false }
    }
    if (snapshot.publishState !== 'idle') {
      return { label: BUILD_STATUS_LABELS[snapshot.publishState] || 'Publishing...', ok: false }
    }
    return { label: 'Not published', ok: false }
  }, [snapshot])

  return (
    <>
    <div style={{ padding: '8px 10px', fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: '#ccc' }}>Building</div>
      {/* ── 1. Information ── */}
      <div style={sectionHeader}>Information</div>
      <Field label="Name"><input value={building.name} onChange={e => update({ name: e.target.value })} /></Field>
      <Field label="Code"><input value={building.code} onChange={e => update({ code: e.target.value })} /></Field>
      <Field label="Category">
        <select value={building.category} onChange={e => update({ category: e.target.value })} style={selectStyle}>
          {['academic','residential','administrative','facility','library','dining','sports','parking','health','other'].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Description"><textarea value={building.description} onChange={e => update({ description: e.target.value })} rows={2} style={inputStyle} /></Field>

      {/* ── 2. Physical ── */}
      <div style={sectionHeader}>Physical</div>
      <Field label="Height">
        <div style={{ color: '#ccc', fontSize: 13 }}>{building.height.toFixed(1)} m</div>
      </Field>
      <Field label="Roof">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="number" step="0.1" value={building.roofHeight ?? 0}
            onChange={e => dispatcher.execute({ id: 'entity.update', label: 'Edit Roof Height', payload: { entityId: building.id, changes: { roofHeight: parseFloat(e.target.value) || 0 } } })}
            style={{ ...inputStyle, width: 80 }} />
          <span style={{ color: '#64748B', fontSize: 11 }}>m</span>
        </div>
      </Field>
      <Field label="Elevation">
        <div style={{ color: '#ccc', fontSize: 13 }}>{building.baseElevation.toFixed(1)} m</div>
      </Field>
      <Field label="Color">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="color" value={building.color} onChange={e => update({ color: e.target.value })} style={{ width: 32, height: 24, padding: 0, border: 'none', cursor: 'pointer' }} />
          <span style={{ color: '#888', fontSize: 11 }}>{building.color}</span>
        </div>
      </Field>
      <Field label="Floors">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#ccc', fontSize: 13 }}>{building.floors.length} Floors</span>
          <button style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 3, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }} onClick={openFloorManager}>
            Manage Floors
          </button>
        </div>
      </Field>

      {/* ── 3. Status ── */}
      <div style={sectionHeader}>Status</div>
      <div style={{ fontSize: 12, color: buildStatus.ok ? '#4ade80' : '#facc15', marginBottom: 3 }}>
        {buildStatus.ok ? '✓' : '⚠'} Build Status: {buildStatus.label}
      </div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>
        Last Published: {formatTimestamp(snapshot.lastPublishedAt)}
      </div>

      {/* ── 4. Actions ── */}
      <div style={sectionHeader}>Actions</div>
      <button style={{...actionBtn, opacity: building.floors.length === 0 ? 0.5 : 1}} disabled={building.floors.length === 0} onClick={() => dispatcher.execute({ id: 'building.editInterior', label: 'Edit Interior', payload: { buildingId: building.id } })}>
        Edit Interior
      </button>
      <button style={{...actionBtn, background: showPositionEditor ? '#2a2a4a' : '#1e1e3a'}} onClick={openPositionEditor}>
        {showPositionEditor ? '▼ Adjust Position' : 'Adjust Position'}
      </button>
      {showPositionEditor && (
        <div style={{ background: '#16162a', border: '1px solid #333', borderRadius: 6, padding: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Position Controls</div>
          <Field label="Latitude">
            <input type="number" step="0.000001" value={positionLat} onChange={e => setPositionLat(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Longitude">
            <input type="number" step="0.000001" value={positionLng} onChange={e => setPositionLng(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Elevation (m)">
            <input type="number" step="0.1" value={positionElevation} onChange={e => setPositionElevation(e.target.value)} style={inputStyle} />
          </Field>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setShowPositionEditor(false)} style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #444', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
            <button onClick={savePosition} style={{ padding: '4px 12px', borderRadius: 4, border: 'none', background: '#1C6BEB', color: '#fff', cursor: 'pointer', fontSize: 11 }}>Apply</button>
          </div>
        </div>
      )}

      {/* ── 5. Assets ── */}
      <div style={sectionHeader}>Assets</div>
      <Field label="Floor Plans">
        {plans.length === 0 ? (
          <div style={{ color: '#666', fontSize: 11 }}>No floors yet</div>
        ) : (
          plans.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#ccc', marginBottom: 2 }}>
              <span>{p.label}</span>
              <span style={{ color: p.hasPlan ? '#4ade80' : '#facc15', fontSize: 11 }}>
                {p.hasPlan ? '✓' : '⚠ Missing'}
              </span>
            </div>
          ))
        )}
      </Field>
      <Field label="Panoramas">
        <div style={{ fontSize: 12, color: hasPanoramas ? '#4ade80' : '#666' }}>
          {hasPanoramas ? '✓ Panorama hotspots exist' : 'No panoramas'}
        </div>
      </Field>

      {/* ── 6. Danger Zone ── */}
      <div style={sectionHeader}>Danger Zone</div>
      <button style={dangerBtn} onClick={() => { editEngine.begin({ kind: 'delete', entityIds: [building.id] }); editEngine.doCommit(); dispatcher.execute({ id: 'building.delete', label: 'Delete Building', payload: { buildingId: building.id } }) }}>
        Delete Building
      </button>
    </div>

      <FloorManagerDialog open={showFloorManager} onClose={() => setShowFloorManager(false)} buildingId={building.id} />
    </>
  )
}
