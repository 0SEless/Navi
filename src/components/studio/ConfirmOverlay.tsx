'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { useStudioStore } from '@/store/studio-store'
import { useGraphStore } from '@/store/graph-store'
import { useCampusMapStore } from '@/store/campus-map-store'

export function ConfirmOverlay() {
  const pendingConfirm = useStudioStore((s) => s.pendingConfirm)
  const clearPendingConfirm = useStudioStore((s) => s.clearPendingConfirm)
  const setActiveBuilding = useStudioStore((s) => s.setActiveBuilding)
  const clearTracePoints = useStudioStore((s) => s.clearTracePoints)
  const activeFloor = useStudioStore((s) => s.activeFloor)
  const traceMode = useStudioStore((s) => s.traceMode)
  const editorMode = useStudioStore((s) => s.editorMode)
  const addBuilding = useGraphStore((s) => s.addBuilding)
  const addTrace = useGraphStore((s) => s.addTrace)
  const graph = useGraphStore((s) => s.graph)
  const currentMapId = useGraphStore((s) => s.currentMapId)
  const saveGraph = useGraphStore((s) => s.save)
  const updateMapStats = useCampusMapStore((s) => s.updateMapStats)

  const [traceName, setTraceName] = useState('')
  const [traceType, setTraceType] = useState<'arterial' | 'path' | 'interior'>(
    editorMode === 'floor' ? 'interior' : traceMode === 'arterial' ? 'arterial' : 'path'
  )
  const [traceColor, setTraceColor] = useState('#10B981')

  if (!pendingConfirm) return null

  const handleSave = () => {
    if (pendingConfirm.type === 'building' && pendingConfirm.points.length >= 3) {
      const points = pendingConfirm.points
      const centroid = {
        lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
        lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
      }
      const id = `bldg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      addBuilding({
        id,
        name: `Building ${id.slice(-6).toUpperCase()}`,
        campusId: currentMapId || '',
        floors: [0],
        footprint: points,
        center: centroid,
        baseElevation: 0,
        height: 15,
        color: '#1C6BEB',
      })
      saveGraph()
      if (currentMapId) {
        updateMapStats(currentMapId, {
          buildings: graph.buildingCount,
          nodes: graph.nodeCount,
          edges: graph.edgeCount,
        })
      }
      setActiveBuilding(id)
    }

    if (pendingConfirm.type === 'trace' && pendingConfirm.points.length >= 2) {
      addTrace({
        id: `T${Date.now()}`,
        name: traceName || undefined,
        floor: activeFloor,
        points: pendingConfirm.points,
        type: traceType,
        color: traceColor,
      })
      saveGraph()
      clearTracePoints()
    }

    clearPendingConfirm()
  }

  const handleCancel = () => {
    if (pendingConfirm.type === 'trace') {
      clearTracePoints()
    }
    clearPendingConfirm()
  }

  const labels: Record<string, string> = {
    building: 'Building footprint',
    trace: traceType === 'interior' ? 'Interior path' : traceType === 'arterial' ? 'Arterial route' : 'Path route',
    boundary: 'Boundary',
  }

  const typeOptions: { value: 'arterial' | 'path' | 'interior'; label: string }[] =
    editorMode === 'floor'
      ? [{ value: 'interior', label: 'Interior' }]
      : [
          { value: 'arterial', label: 'Arterial' },
          { value: 'path', label: 'Path / Connector' },
        ]

  const COLOR_SWATCHES = [
    '#10B981', '#1C6BEB', '#7C3AED', '#F59E0B', '#EF4444',
    '#06B6D4', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316',
    '#6366F1', '#84CC16', '#0EA5E9', '#D946EF', '#FB923C',
  ]

  return (
    <div style={{
      position: 'absolute',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 20,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
    }}>
      {pendingConfirm.type === 'trace' && (
        <div style={{
          background: 'var(--navi-card)',
          border: '1px solid var(--navi-border)',
          borderRadius: 10,
          padding: '12px 16px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          minWidth: 280,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)' }}>
            {labels[pendingConfirm.type]}
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>NAME</div>
            <input value={traceName} onChange={(e) => setTraceName(e.target.value)}
              placeholder="e.g. Main Road, Path to Admin"
              style={{
                padding: '5px 8px', borderRadius: 4, border: '1px solid var(--navi-border)',
                background: 'var(--navi-card)', color: 'var(--navi-text)', fontSize: 12, outline: 'none', width: '100%',
              }} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>TYPE</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {typeOptions.map((opt) => (
                <button key={opt.value} onClick={() => setTraceType(opt.value)}
                  style={{
                    padding: '4px 12px', borderRadius: 4, border: '1px solid var(--navi-border)',
                    background: traceType === opt.value ? 'var(--navi-primary)' : 'transparent',
                    color: traceType === opt.value ? '#fff' : 'var(--navi-text-secondary)',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >{opt.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>COLOR</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {COLOR_SWATCHES.map((c) => (
                <button key={c} onClick={() => setTraceColor(c)}
                  style={{ width: 20, height: 20, borderRadius: 4, background: c, border: traceColor === c ? '2px solid var(--navi-text)' : '1px solid var(--navi-border)', cursor: 'pointer' }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {pendingConfirm.type !== 'trace' && (
        <div style={{
          fontSize: 11,
          color: 'var(--navi-text-secondary)',
          background: 'var(--navi-card)',
          padding: '4px 12px',
          borderRadius: 6,
          border: '1px solid var(--navi-border)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          {labels[pendingConfirm.type]} complete — confirm or cancel
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleCancel}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: '1px solid var(--navi-border)',
            background: 'var(--navi-card)',
            color: '#EF4444',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
        >
          <X size={16} /> Cancel
        </button>
        <button
          onClick={handleSave}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: 'none',
            background: '#10B981',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
          }}
        >
          <Check size={16} /> Save
        </button>
      </div>
    </div>
  )
}
