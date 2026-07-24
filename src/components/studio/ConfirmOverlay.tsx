'use client'

import { useState } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
import { useEditor, useEditingEngine, genId } from '@navi/editor'
import { useStudioStore } from '@/store/studio-store'

export function ConfirmOverlay() {
  const { services } = useEditor()
  const editEngine = useEditingEngine()
  const dispatcher = services.get('dispatcher')!
  const workflow = services.get('workflow')!

  const pendingConfirm = useStudioStore((s) => s.pendingConfirm)
  const clearPendingConfirm = useStudioStore((s) => s.clearPendingConfirm)
  const setActiveBuilding = useStudioStore((s) => s.setActiveBuilding)
  const clearTracePoints = useStudioStore((s) => s.clearTracePoints)
  const activeFloor = useStudioStore((s) => s.activeFloor)
  const [importing, setImporting] = useState(false)

  const [traceName, setTraceName] = useState('')
  const [traceType, setTraceType] = useState<'arterial' | 'connector'>('arterial')
  const [traceColor, setTraceColor] = useState('#1C6BEB')
  const routeWidth = useStudioStore((s) => s.routeWidth)
  const setRouteWidth = useStudioStore((s) => s.setRouteWidth)
  const clearDrawPoints = useStudioStore((s) => s.clearDrawPoints)

  if (!pendingConfirm) return null

  const handleSave = async () => {
    if (pendingConfirm.type === 'building' && pendingConfirm.points.length >= 3) {
      const points = pendingConfirm.points
      const id = genId('bldg')
      editEngine.begin({ kind: 'create', entityType: 'building', geometry: points, properties: { name: `Building ${id.slice(-6).toUpperCase()}`, color: '#1C6BEB', height: 15 } })
      editEngine.doCommit()
      dispatcher.execute({
        id: 'building.create',
        label: 'Create Building',
        payload: {
          id,
          name: `Building ${id.slice(-6).toUpperCase()}`,
          footprint: { points },
          floors: [{ id: genId('flr'), level: 0, label: 'Ground Floor', elevation: 0, height: 3.5, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], metadata: {} }],
          height: 15,
          color: '#1C6BEB',
        },
      })
      setActiveBuilding(id)
      clearDrawPoints()
      await workflow.save('manual')
    }

    if (pendingConfirm.type === 'route' && pendingConfirm.points.length >= 2) {
      editEngine.begin({ kind: 'create', entityType: 'road', geometry: pendingConfirm.points, properties: { name: traceName, type: traceType, width: routeWidth, color: traceColor } })
      editEngine.doCommit()
      dispatcher.execute({
        id: 'road.create',
        label: 'Create Road',
        payload: {
          id: genId('T'),
          name: traceName || '',
          points: pendingConfirm.points,
          type: traceType,
          width: routeWidth,
          metadata: { color: traceColor },
        },
      })
      clearTracePoints()
      await workflow.save('manual')
    }

    if (pendingConfirm.type === 'boundary' && pendingConfirm.points.length >= 3) {
      setImporting(true)
      dispatcher.execute({
        id: 'boundary.set',
        label: 'Set Campus Boundary',
        payload: { points: pendingConfirm.points },
      })
      clearDrawPoints()
      await workflow.save('manual')

      try {
        const res = await fetch('/api/osm-buildings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boundary: pendingConfirm.points }),
        })
        if (res.ok) {
          const data = await res.json()
          const bldgs: Array<{ id: string; footprint: Array<{ lat: number; lng: number }>; height: number; color: string }> = data.buildings ?? []
          for (let i = 0; i < bldgs.length; i++) {
            const b = bldgs[i]
            dispatcher.execute({
              id: 'building.create',
              label: 'Import Building',
              payload: {
                id: b.id,
                name: `Bldg No. ${i + 1}`,
                footprint: { points: b.footprint },
                floors: [{ id: genId('flr'), level: 0, label: 'Ground Floor', elevation: 0, height: 3.5, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], metadata: {} }],
                height: b.height,
                color: b.color,
              },
            })
          }
          if (bldgs.length > 0) await workflow.save('manual')
        }
      } catch {
      } finally {
        setImporting(false)
      }
    }

    clearPendingConfirm()
  }

  const handleCancel = () => {
    if (pendingConfirm.type === 'route') {
      clearTracePoints()
    }
    clearDrawPoints()
    clearPendingConfirm()
  }

  const labels: Record<string, string> = {
    building: 'Building footprint',
    route: traceType === 'arterial' ? 'Arterial route' : 'Connector path',
    boundary: 'Boundary',
  }

  const typeOptions: { value: 'arterial' | 'connector'; label: string }[] = [
    { value: 'arterial', label: 'Arterial' },
    { value: 'connector', label: 'Connector' },
  ]

  const COLOR_SWATCHES = [
    '#1C6BEB', '#7C3AED', '#F59E0B', '#EF4444',
    '#06B6D4', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316',
    '#6366F1', '#84CC16', '#0EA5E9', '#D946EF', '#FB923C',
    '#FFFFFF',
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
      {pendingConfirm.type === 'route' && (
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
          <div>
            <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>ROAD WIDTH</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setRouteWidth(routeWidth - 1)}
                style={{
                  width: 28, height: 28, borderRadius: 4, border: '1px solid var(--navi-border)',
                  background: 'var(--navi-card)', color: 'var(--navi-text)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
                }}
              >−</button>
              <span style={{ fontSize: 13, color: 'var(--navi-text)', fontWeight: 600, minWidth: 24, textAlign: 'center' }}>
                {routeWidth}
              </span>
              <button onClick={() => setRouteWidth(routeWidth + 1)}
                style={{
                  width: 28, height: 28, borderRadius: 4, border: '1px solid var(--navi-border)',
                  background: 'var(--navi-card)', color: 'var(--navi-text)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
                }}
              >+</button>
            </div>
          </div>
        </div>
      )}

      {pendingConfirm.type !== 'route' && (
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
          disabled={importing}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: 'none',
            background: importing ? 'var(--navi-border)' : '#10B981',
            color: importing ? 'var(--navi-text-secondary)' : '#fff',
            cursor: importing ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: importing ? 'none' : '0 2px 8px rgba(16,185,129,0.3)',
          }}
        >
          {importing ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={16} />}
          {importing ? 'Importing buildings...' : 'Save'}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
