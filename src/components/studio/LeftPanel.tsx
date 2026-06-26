'use client'

import { useState } from 'react'
import { useGraphStore } from '@/store/graph-store'
import { useStudioStore } from '@/store/studio-store'
import { useCampusMapStore } from '@/store/campus-map-store'
import { Building2, MapPin, ChevronDown, ChevronRight, Plus, Trash2, Eye, EyeOff, Palette } from 'lucide-react'

const COLOR_OPTIONS = [
  '#1C6BEB', '#7C3AED', '#10B981', '#F59E0B', '#EF4444',
  '#06B6D4', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316',
]

export function LeftPanel() {
  const buildings = useGraphStore((s) => s.graph.buildings)
  const setActiveBuilding = useStudioStore((s) => s.setActiveBuilding)
  const activeBuildingId = useStudioStore((s) => s.activeBuildingId)
  const currentMapId = useGraphStore((s) => s.currentMapId)
  const landmarkTypes = useCampusMapStore((s) => s.landmarkTypes.filter((t) => t.mapId === currentMapId))
  const landmarkInstances = useCampusMapStore((s) => s.landmarkInstances.filter((i) => i.mapId === currentMapId))
  const addLandmarkType = useCampusMapStore((s) => s.addLandmarkType)
  const removeLandmarkType = useCampusMapStore((s) => s.removeLandmarkType)

  const [showBuildings, setShowBuildings] = useState(true)
  const [showLandmarks, setShowLandmarks] = useState(true)
  const [addingType, setAddingType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeColor, setNewTypeColor] = useState('#10B981')

  const handleAddType = () => {
    if (!newTypeName.trim() || !currentMapId) return
    addLandmarkType({ mapId: currentMapId, name: newTypeName.trim(), color: newTypeColor, icon: 'map-pin' })
    setNewTypeName('')
    setAddingType(false)
  }

  return (
    <div style={{
      width: 200,
      background: 'var(--navi-card)',
      borderRight: '1px solid var(--navi-border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--navi-border)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Outliner
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        <button
          onClick={() => setShowBuildings(!showBuildings)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, width: '100%',
            padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 600, color: 'var(--navi-text)',
          }}
        >
          {showBuildings ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Building2 size={12} />
          Buildings
          <span style={{ marginLeft: 'auto', color: 'var(--navi-text-secondary)', fontSize: 10 }}>{buildings.length}</span>
        </button>

        {showBuildings && (
          <div>
            {buildings.length === 0 && (
              <div style={{ padding: '8px 12px 8px 28px', fontSize: 10, color: 'var(--navi-text-secondary)' }}>
                No buildings yet
              </div>
            )}
            {buildings.map((b) => (
              <button
                key={b.id}
                onClick={() => setActiveBuilding(b.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  padding: '5px 12px 5px 28px', border: 'none',
                  background: activeBuildingId === b.id ? 'var(--navi-content)' : 'none',
                  cursor: 'pointer', fontSize: 11, color: 'var(--navi-text)', textAlign: 'left',
                }}
                onMouseEnter={(e) => { if (activeBuildingId !== b.id) e.currentTarget.style.background = 'var(--navi-content)' }}
                onMouseLeave={(e) => { if (activeBuildingId !== b.id) e.currentTarget.style.background = 'none' }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: b.color || '#1C6BEB', flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ height: 1, background: 'var(--navi-content)', margin: '4px 12px' }} />

        <button
          onClick={() => setShowLandmarks(!showLandmarks)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, width: '100%',
            padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 600, color: 'var(--navi-text)',
          }}
        >
          {showLandmarks ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <MapPin size={12} />
          Landmarks
          <span style={{ marginLeft: 'auto', color: 'var(--navi-text-secondary)', fontSize: 10 }}>{landmarkTypes.length}</span>
        </button>

        {showLandmarks && (
          <div>
            {landmarkTypes.length === 0 && !addingType && (
              <div style={{ padding: '8px 12px 8px 28px', fontSize: 10, color: 'var(--navi-text-secondary)' }}>
                No types yet
              </div>
            )}
            {landmarkTypes.map((t) => {
              const count = landmarkInstances.filter((i) => i.typeId === t.id).length
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 12px 3px 28px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--navi-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--navi-text-secondary)', marginRight: 4 }}>{count}</span>
                  <button onClick={() => { if (window.confirm(`Delete "${t.name}"?`)) removeLandmarkType(t.id) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navi-text-secondary)', padding: 2, display: 'flex', opacity: 0 }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              )
            })}
            {addingType ? (
              <div style={{ padding: '6px 12px 6px 28px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <input
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="Type name"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddType()}
                  style={{
                    padding: '4px 8px', borderRadius: 4, border: '1px solid var(--navi-border)',
                    background: 'var(--navi-card)', color: 'var(--navi-text)', fontSize: 11, outline: 'none', width: '100%',
                  }}
                />
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {COLOR_OPTIONS.map((c) => (
                    <button key={c} onClick={() => setNewTypeColor(c)}
                      style={{ width: 16, height: 16, borderRadius: 3, background: c, border: newTypeColor === c ? '2px solid var(--navi-text)' : '1px solid var(--navi-border)', cursor: 'pointer' }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setAddingType(false); setNewTypeName('') }}
                    style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--navi-border)', background: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--navi-text-secondary)' }}>
                    Cancel
                  </button>
                  <button onClick={handleAddType}
                    style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: 'var(--navi-primary)', cursor: 'pointer', fontSize: 10, color: '#fff' }}>
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingType(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px 4px 28px',
                  border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--navi-text-secondary)', width: '100%',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--navi-text)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--navi-text-secondary)' }}
              >
                <Plus size={10} /> New Type
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
