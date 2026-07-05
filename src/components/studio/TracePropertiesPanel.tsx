'use client'

import { useState } from 'react'
import { Trash2, Pencil, X } from 'lucide-react'
import { useGraphStore } from '@/store/graph-store'
import { useStudioStore } from '@/store/studio-store'
import type { TracePath } from '@/types/nav-types'

const COLOR_SWATCHES = [
  '#FFFFFF', '#1C6BEB', '#7C3AED', '#F59E0B', '#EF4444',
  '#06B6D4', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316',
  '#6366F1', '#84CC16', '#0EA5E9', '#D946EF', '#FB923C',
]

interface TracePropertiesPanelProps {
  trace: TracePath
  onClose: () => void
}

export function TracePropertiesPanel({ trace, onClose }: TracePropertiesPanelProps) {
  const [name, setName] = useState(trace.name ?? '')
  const [color, setColor] = useState(trace.color ?? '#FFFFFF')
  const [routeWidth, setRouteWidth] = useState(trace.width ?? 8)
  const [type, setType] = useState<'arterial' | 'connector'>(trace.type)
  const [connectorBuildingId, setConnectorBuildingId] = useState(trace.connectorToBuildingId ?? '')
  const [connectorEntranceId, setConnectorEntranceId] = useState(trace.connectorToEntranceId ?? '')

  const graph = useGraphStore((s) => s.graph)
  const updateTrace = useGraphStore((s) => s.updateTrace)
  const removeTrace = useGraphStore((s) => s.removeTrace)
  const save = useGraphStore((s) => s.save)
  const setVertexEditing = useStudioStore((s) => s.setVertexEditing)

  const handleSave = () => {
    updateTrace(trace.id, {
      name: name || undefined,
      color,
      type,
      width: routeWidth,
      connectorToBuildingId: type === 'connector' ? connectorBuildingId || undefined : undefined,
      connectorToEntranceId: type === 'connector' ? connectorEntranceId || undefined : undefined,
    })
    save()
  }

  const handleDelete = () => {
    removeTrace(trace.id)
    save()
    onClose()
  }

  const handleVertexEdit = () => {
    setVertexEditing('trace', trace.id)
  }

  const buildings = graph.buildings

  const getEntrancesForBuilding = (): { id: string; label?: string; floor: number }[] => {
    const b = buildings.find((b) => b.id === connectorBuildingId)
    return b?.entrances ?? []
  }

  return (
    <div style={{ borderTop: '1px solid var(--navi-border)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Route Properties
        </div>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navi-text-secondary)', display: 'flex', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      <div>
        <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>NAME</div>
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Main Road"
          style={{
            padding: '5px 8px', borderRadius: 4, border: '1px solid var(--navi-border)',
            background: 'var(--navi-card)', color: 'var(--navi-text)', fontSize: 12, outline: 'none', width: '100%',
          }} />
      </div>

      <div>
        <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>TYPE</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setType('arterial')}
            style={{
              padding: '4px 10px', borderRadius: 4, border: '1px solid var(--navi-border)',
              background: type === 'arterial' ? 'var(--navi-primary)' : 'transparent',
              color: type === 'arterial' ? '#fff' : 'var(--navi-text-secondary)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>Arterial</button>
          <button onClick={() => setType('connector')}
            style={{
              padding: '4px 10px', borderRadius: 4, border: '1px solid var(--navi-border)',
              background: type === 'connector' ? 'var(--navi-primary)' : 'transparent',
              color: type === 'connector' ? '#fff' : 'var(--navi-text-secondary)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>Connector</button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>COLOR</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {COLOR_SWATCHES.map((c) => (
            <button key={c} onClick={() => setColor(c)}
              style={{ width: 20, height: 20, borderRadius: 4, background: c, border: color === c ? '2px solid var(--navi-text)' : '1px solid var(--navi-border)', cursor: 'pointer' }} />
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>WIDTH</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setRouteWidth(Math.max(2, routeWidth - 1))}
            style={{
              width: 28, height: 28, borderRadius: 4, border: '1px solid var(--navi-border)',
              background: 'var(--navi-card)', color: 'var(--navi-text)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
            }}
          >−</button>
          <span style={{ fontSize: 13, color: 'var(--navi-text)', fontWeight: 600, minWidth: 24, textAlign: 'center' }}>
            {routeWidth}
          </span>
          <button onClick={() => setRouteWidth(Math.min(24, routeWidth + 1))}
            style={{
              width: 28, height: 28, borderRadius: 4, border: '1px solid var(--navi-border)',
              background: 'var(--navi-card)', color: 'var(--navi-text)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
            }}
          >+</button>
        </div>
      </div>

      {type === 'connector' && (
        <>
          <div>
            <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>CONNECTS TO BUILDING</div>
            <select value={connectorBuildingId} onChange={(e) => { setConnectorBuildingId(e.target.value); setConnectorEntranceId('') }}
              style={{
                padding: '5px 8px', borderRadius: 4, border: '1px solid var(--navi-border)',
                background: 'var(--navi-card)', color: 'var(--navi-text)', fontSize: 12, outline: 'none', width: '100%',
              }}>
              <option value="">Select building...</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {connectorBuildingId && (
            <div>
              <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>ENTRANCE</div>
              <select value={connectorEntranceId} onChange={(e) => setConnectorEntranceId(e.target.value)}
                style={{
                  padding: '5px 8px', borderRadius: 4, border: '1px solid var(--navi-border)',
                  background: 'var(--navi-card)', color: 'var(--navi-text)', fontSize: 12, outline: 'none', width: '100%',
                }}>
                <option value="">Select entrance...</option>
                {getEntrancesForBuilding().map((e) => (
                  <option key={e.id} value={e.id}>{e.label ?? e.id} ({e.floor === 0 ? 'GF' : `${e.floor}F`})</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      <button onClick={handleVertexEdit}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
          padding: '6px 12px', borderRadius: 6, border: '1px solid var(--navi-border)',
          background: 'transparent', color: 'var(--navi-text)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}>
        <Pencil size={13} /> Edit Vertices
      </button>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={handleSave}
          style={{
            flex: 1, padding: '6px 12px', borderRadius: 6, border: 'none',
            background: 'var(--navi-primary)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>
          Save
        </button>
        <button onClick={handleDelete}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px',
            borderRadius: 6, border: '1px solid #EF4444', background: 'transparent',
            color: '#EF4444', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </div>
  )
}
