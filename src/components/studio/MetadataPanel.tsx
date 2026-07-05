'use client'

import { useState, useEffect, useRef } from 'react'
import { Trash2, ArrowLeft, Upload, Edit, CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useGraphStore } from '@/store/graph-store'
import { useStudioStore } from '@/store/studio-store'
import type { Building } from '@/types/nav-types'

const COLOR_SWATCHES = [
  '#1C6BEB', '#7C3AED', '#10B981', '#F59E0B', '#EF4444',
  '#06B6D4', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316',
  '#6366F1', '#84CC16', '#0EA5E9', '#D946EF', '#FB923C',
]

export function MetadataPanel() {
  const activeBuildingId = useStudioStore((s) => s.activeBuildingId)
  const setActiveBuilding = useStudioStore((s) => s.setActiveBuilding)
  const graph = useGraphStore((s) => s.graph)
  const buildings = graph.buildings
  const updateBuilding = useGraphStore((s) => s.updateBuilding)
  const removeBuilding = useGraphStore((s) => s.removeBuilding)
  const save = useGraphStore((s) => s.save)

  const building = activeBuildingId ? buildings.find((b) => b.id === activeBuildingId) : null
  const [dirty, setDirty] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [fallbackBuilding, setFallbackBuilding] = useState<Building | null>(null)
  const prevActiveIdRef = useRef(activeBuildingId)

  useEffect(() => {
    if (building && building !== fallbackBuilding) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFallbackBuilding(building)
    }
  }, [building, fallbackBuilding])

  useEffect(() => {
    if (prevActiveIdRef.current && !activeBuildingId && dirty) {
      const last = fallbackBuilding
      if (last) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShowDialog(true)
        setActiveBuilding(prevActiveIdRef.current)
      }
    }
    prevActiveIdRef.current = activeBuildingId
  }, [activeBuildingId, dirty, setActiveBuilding, fallbackBuilding])

  const formBuilding = building || fallbackBuilding

  if (!building && !showDialog && !fallbackBuilding) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontSize: 11,
        color: 'var(--navi-text-secondary)',
        borderTop: '1px solid var(--navi-border)',
      }}>
        Click a building on the map to edit its properties
      </div>
    )
  }

  if (!formBuilding) return null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--navi-border)' }}>
        <button onClick={() => {
          if (dirty) {
            setShowDialog(true)
          } else {
            setActiveBuilding(null)
          }
        }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navi-text-secondary)', display: 'flex', padding: 2 }}>
          <ArrowLeft size={16} />
        </button>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {dirty ? 'Building Properties *' : 'Building Properties'}
        </span>
      </div>

      <BuildingForm
        key={formBuilding.id}
        building={formBuilding}
        onDirty={setDirty}
        onSave={(partial) => {
          updateBuilding(formBuilding.id, partial)
          save()
          setDirty(false)
        }}
        onDelete={() => {
          removeBuilding(formBuilding.id)
          save()
          setActiveBuilding(null)
          setDirty(false)
        }}
      />

      {showDialog && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20,
        }}>
          <div style={{
            background: 'var(--navi-card)', borderRadius: 10, padding: 20,
            border: '1px solid var(--navi-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            minWidth: 240, display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navi-text)' }}>Save Changes?</div>
            <div style={{ fontSize: 11, color: 'var(--navi-text-secondary)' }}>You have unsaved changes to this building.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => {
                setShowDialog(false)
              }}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--navi-border)', background: 'transparent', color: 'var(--navi-text)', fontSize: 11, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => {
                setDirty(false)
                setShowDialog(false)
                setActiveBuilding(null)
              }}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#EF4444', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
                Discard
              </button>
              <button onClick={() => {
                if (dirty) save()
                setDirty(false)
                setShowDialog(false)
                setActiveBuilding(null)
              }}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--navi-primary)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BuildingForm({ building, onDirty, onSave, onDelete }: {
  building: Building
  onDirty: (dirty: boolean) => void
  onSave: (partial: Partial<Building>) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(building.name)
  const [height, setHeight] = useState(building.height)
  const [floors, setFloors] = useState(building.floors.length)
  const [color, setColor] = useState(building.color || '#1C6BEB')
  const [floorPlanUrls, setFloorPlanUrls] = useState<Record<number, string>>(building.floorPlanUrls ?? {})
  const router = useRouter()
  const currentMapId = useGraphStore((s) => s.currentMapId)

  useEffect(() => {
    const changed = name !== building.name || height !== building.height ||
      floors !== building.floors.length || color !== (building.color || '#1C6BEB')
    onDirty(changed)
  }, [name, height, floors, color, building, onDirty])

  const handleSave = () => {
    onSave({ name, height, floors: Array.from({ length: floors }, (_, i) => i), color, floorPlanUrls })
  }

  const handleFloorPlanUpload = (floorIdx: number, file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setFloorPlanUrls((prev) => ({ ...prev, [floorIdx]: dataUrl }))
      onDirty(true)
    }
    reader.readAsDataURL(file)
  }

  const floorLabel = (f: number) => f === 0 ? 'GF' : f > 0 ? `${f}F` : `${f}F`

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="NAME">
        <input value={name} onChange={(e) => setName(e.target.value)} style={INPUT_STYLE} />
      </Field>

      <Field label="HEIGHT">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StepBtn onClick={() => setHeight(Math.max(1, height - 1))}>-</StepBtn>
          <input value={height} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1) setHeight(v) }}
            style={{ ...INPUT_STYLE, width: 44, textAlign: 'center' }} />
          <span style={{ fontSize: 10, color: 'var(--navi-text-secondary)' }}>m</span>
          <StepBtn onClick={() => setHeight(height + 1)}>+</StepBtn>
        </div>
      </Field>

      <Field label="FLOORS">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StepBtn onClick={() => setFloors(Math.max(1, floors - 1))}>-</StepBtn>
          <input value={floors} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1) setFloors(v) }}
            style={{ ...INPUT_STYLE, width: 44, textAlign: 'center' }} />
          <StepBtn onClick={() => setFloors(floors + 1)}>+</StepBtn>
        </div>
      </Field>

      <Field label="COLOR">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {COLOR_SWATCHES.map((c) => (
            <button key={c} onClick={() => setColor(c)}
              style={{ width: 24, height: 24, borderRadius: 4, background: c, border: color === c ? '2px solid var(--navi-text)' : '1px solid var(--navi-border)', cursor: 'pointer' }} />
          ))}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
            style={{ width: 24, height: 24, padding: 0, border: '1px solid var(--navi-border)', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
        </div>
      </Field>

      <Field label="FLOOR IMAGES">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Array.from({ length: floors }, (_, i) => i).map((floorIdx) => (
            <div key={floorIdx} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 6px', borderRadius: 4, background: 'var(--navi-content)',
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text)', minWidth: 24 }}>
                {floorLabel(floorIdx)}
              </span>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 4, border: '1px solid var(--navi-border)',
                fontSize: 10, color: 'var(--navi-text-secondary)', cursor: 'pointer',
              }}>
                <Upload size={12} />
                {floorPlanUrls[floorIdx] ? 'Replace' : 'Upload'}
                <input type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFloorPlanUpload(floorIdx, f); e.target.value = '' }} />
              </label>
              {floorPlanUrls[floorIdx] && (
                <span style={{ color: '#10B981', display: 'flex', alignItems: 'center' }}>
                  <CheckCircle size={12} />
                </span>
              )}
              <div style={{ flex: 1 }} />
              {currentMapId && (
                <button onClick={() => router.push(`/studio/${currentMapId}/edit/building/${building.id}/floor/${floorIdx}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '3px 8px', borderRadius: 4, border: '1px solid var(--navi-border)',
                    background: 'var(--navi-primary)', color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  }}>
                  <Edit size={10} /> Edit Floor
                </button>
              )}
            </div>
          ))}
        </div>
      </Field>

      <Field label="ID">
        <div style={{ fontSize: 10, color: 'var(--navi-text-secondary)', wordBreak: 'break-all' }}>{building.id}</div>
      </Field>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={handleSave}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: 'none', background: 'var(--navi-primary)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          Save Changes
        </button>
        <button onClick={onDelete}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', borderRadius: 6, border: '1px solid #EF4444', background: 'transparent', color: '#EF4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  )
}

function StepBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--navi-border)', background: 'var(--navi-content)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navi-text)', fontSize: 14 }}>
      {children}
    </button>
  )
}

const INPUT_STYLE: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 4, border: '1px solid var(--navi-border)',
  background: 'var(--navi-card)', color: 'var(--navi-text)', fontSize: 12, outline: 'none', width: '100%',
}
