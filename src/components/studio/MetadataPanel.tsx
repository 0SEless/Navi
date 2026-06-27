'use client'

import { useState } from 'react'
import { MoreVertical, Check, X, Minus, Plus, ChevronDown } from 'lucide-react'
import { useGraphStore } from '@/store/graph-store'
import { useStudioStore } from '@/store/studio-store'
import { useCampusMapStore } from '@/store/campus-map-store'
import type { Building } from '@/types/nav-types'

const COLOR_SWATCHES = [
  '#1C6BEB', '#7C3AED', '#10B981', '#F59E0B', '#EF4444',
  '#06B6D4', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316',
  '#6366F1', '#84CC16', '#0EA5E9', '#D946EF', '#FB923C',
]

export function MetadataPanel() {
  const activeBuildingId = useStudioStore((s) => s.activeBuildingId)
  const graph = useGraphStore((s) => s.graph)
  const buildings = graph.buildings
  const updateBuilding = useGraphStore((s) => s.updateBuilding)
  const save = useGraphStore((s) => s.save)
  const setEditorMode = useStudioStore((s) => s.setEditorMode)
  const currentMapId = useGraphStore((s) => s.currentMapId)
  const allLandmarkTypes = useCampusMapStore((s) => s.landmarkTypes)
  const landmarkTypes = allLandmarkTypes.filter((t) => t.mapId === currentMapId)

  const building = activeBuildingId ? buildings.find((b) => b.id === activeBuildingId) : null

  console.log('[MetadataPanel] render', { activeBuildingId, building: building?.id })

  if (!building) return null

  return <MetadataForm key={building.id} building={building} updateBuilding={updateBuilding} onEditFloor={() => setEditorMode('floor')} onSave={save} landmarkTypes={landmarkTypes.map((t) => ({ id: t.id, name: t.name }))} />
}

function MetadataForm({
  building, updateBuilding, onEditFloor, onSave, landmarkTypes,
}: {
  building: Building
  updateBuilding: (id: string, partial: Partial<Building>) => void
  onEditFloor: () => void
  onSave: () => void
  landmarkTypes: { id: string; name: string }[]
}) {
  const [editing, setEditing] = useState(false)
  const [recentColors] = useState<string[]>(['#1C6BEB', '#7C3AED'])
  const [name, setName] = useState(building.name)
  const [code, setCode] = useState(building.code || '')
  const [dept, setDept] = useState(building.department || '')
  const [category, setCategory] = useState(building.category || '')
  const [floors, setFloors] = useState(building.floors.length)
  const [color, setColor] = useState(building.color || '#1C6BEB')
  const [height, setHeight] = useState(building.height)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const handleSave = () => {
    updateBuilding(building.id, {
      name,
      height,
      floors: Array.from({ length: floors }, (_, i) => i),
      color,
      department: dept,
      code,
      category,
    })
    onSave()
    setEditing(false)
  }

  const handleCancel = () => {
    setName(building.name)
    setCode(building.id.slice(-6).toUpperCase())
    setDept(building.department || '')
    setCategory(building.category || '')
    setFloors(building.floors.length)
    setColor(building.color || '#1C6BEB')
    setHeight(building.height)
    setEditing(false)
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px', borderTop: '1px solid var(--navi-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Metadata
        </span>
        {!editing && (
          <button onClick={() => setEditing(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navi-text-secondary)', padding: 2, display: 'flex' }}>
            <MoreVertical size={14} />
          </button>
        )}
        {editing && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={handleCancel}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 2, display: 'flex' }}>
              <X size={14} />
            </button>
            <button onClick={handleSave}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10B981', padding: 2, display: 'flex' }}>
              <Check size={14} />
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Field label="Name" editing={editing}>
          {editing ? (
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          ) : (
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--navi-text)' }}>{building.name}</span>
          )}
        </Field>

        <Field label="Code" editing={editing}>
          {editing ? (
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ ...inputStyle, maxWidth: 80 }} />
          ) : (
            <span style={{ fontSize: 12, color: 'var(--navi-text)' }}>{code}</span>
          )}
        </Field>

        <Field label="Department" editing={editing}>
          {editing ? (
            <input value={dept} onChange={(e) => setDept(e.target.value)} style={inputStyle} />
          ) : (
            <span style={{ fontSize: 12, color: 'var(--navi-text)' }}>{dept || '—'}</span>
          )}
        </Field>

        <Field label="Category" editing={editing}>
          {editing ? (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                padding: '4px 8px', borderRadius: 4, border: '1px solid var(--navi-border)',
                background: 'var(--navi-card)', color: 'var(--navi-text)', fontSize: 12, outline: 'none', width: '100%',
              }}
            >
              <option value="">(don't specify)</option>
              {landmarkTypes.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--navi-text)' }}>{category || "(don't specify)"}</span>
          )}
        </Field>

        <Field label="Floors" editing={editing}>
          {editing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setFloors(Math.max(1, floors - 1))} style={stepperBtnStyle}><Minus size={12} /></button>
              <input value={floors} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1) setFloors(v) }} style={{ ...inputStyle, width: 36, textAlign: 'center' }} />
              <button onClick={() => setFloors(floors + 1)} style={stepperBtnStyle}><Plus size={12} /></button>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--navi-text)' }}>{building.floors.length}</span>
          )}
        </Field>

        <Field label="Height" editing={editing}>
          {editing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setHeight(Math.max(1, height - 1))} style={stepperBtnStyle}><Minus size={12} /></button>
              <input value={height} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1) setHeight(v) }} style={{ ...inputStyle, width: 40, textAlign: 'center' }} />
              <span style={{ fontSize: 10, color: 'var(--navi-text-secondary)' }}>m</span>
              <button onClick={() => setHeight(height + 1)} style={stepperBtnStyle}><Plus size={12} /></button>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--navi-text)' }}>{building.height}m</span>
          )}
        </Field>

        <Field label="Color" editing={editing}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 16, height: 16, borderRadius: 3, background: color, border: '1px solid var(--navi-border)' }} />
            {!editing ? (
              <span style={{ fontSize: 10, color: 'var(--navi-text-secondary)' }}>{color}</span>
            ) : (
              <button onClick={() => setShowColorPicker(!showColorPicker)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navi-text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: 0 }}>
                Change <ChevronDown size={10} />
              </button>
            )}
          </div>
          {editing && showColorPicker && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recentColors.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>RECENT</div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {recentColors.map((c) => (
                      <button key={c} onClick={() => { setColor(c); setShowColorPicker(false) }}
                        style={{ width: 18, height: 18, borderRadius: 3, background: c, border: color === c ? '2px solid var(--navi-text)' : '1px solid var(--navi-border)', cursor: 'pointer' }} />
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>SWATCHES</div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {COLOR_SWATCHES.map((c) => (
                    <button key={c} onClick={() => { setColor(c); setShowColorPicker(false) }}
                      style={{ width: 18, height: 18, borderRadius: 3, background: c, border: color === c ? '2px solid var(--navi-text)' : '1px solid var(--navi-border)', cursor: 'pointer' }} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </Field>

        {!editing && (
          <button onClick={onEditFloor}
            style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--navi-primary)', background: 'transparent', color: 'var(--navi-primary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Edit Floor
          </button>
        )}
      </div>
    </div>
  )
}

function Field({ label, editing, children }: { label: string; editing: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 4, border: '1px solid var(--navi-border)',
  background: 'var(--navi-card)', color: 'var(--navi-text)', fontSize: 12, outline: 'none', width: '100%',
}

const stepperBtnStyle: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 4, border: '1px solid var(--navi-border)',
  background: 'var(--navi-content)', cursor: 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'center', color: 'var(--navi-text)',
}
