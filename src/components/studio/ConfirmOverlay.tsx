'use client'

import { useState } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
import { useEditor, useEditingEngine, genId } from '@navi/editor'
import type { RoadDisplayMode } from '@navi/core'
import { useStudioStore } from '@/store/studio-store'
import { showImportToast } from './ImportToast'

export function ConfirmOverlay() {
  const { services } = useEditor()
  const editEngine = useEditingEngine()
  const dispatcher = services.get('dispatcher')!
  const workflow = services.get('workflow')!

  const pendingConfirm = useStudioStore((s) => s.pendingConfirm)
  const clearPendingConfirm = useStudioStore((s) => s.clearPendingConfirm)
  const setActiveBuilding = useStudioStore((s) => s.setActiveBuilding)
  const clearTracePoints = useStudioStore((s) => s.clearTracePoints)
  const [importing, setImporting] = useState(false)

  const [traceName, setTraceName] = useState('')
  const [traceType, setTraceType] = useState<'arterial' | 'connector'>('arterial')
  const [traceDisplayMode, setTraceDisplayMode] = useState<RoadDisplayMode>('visible')
  const [traceColor, setTraceColor] = useState('#1C6BEB')
  const [areaName, setAreaName] = useState('')
  const [areaColor, setAreaColor] = useState('#8B5CF6')
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
      editEngine.begin({ kind: 'create', entityType: 'road', geometry: pendingConfirm.points, properties: { name: traceName, type: traceType, width: routeWidth, color: traceColor, displayMode: traceDisplayMode } })
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
          displayMode: traceDisplayMode,
          metadata: { color: traceColor },
          // Fix 1: explicit Connect / Keep Separate decisions are committed
          // atomically with the road (junction authority + geometry projection).
          ...(pendingConfirm.connections && pendingConfirm.connections.length > 0
            ? { connections: pendingConfirm.connections }
            : {}),
        },
      })
      clearTracePoints()
      setTraceDisplayMode('visible')
      await workflow.save('manual')
    }

    if ((pendingConfirm.type === 'boundary' || pendingConfirm.type === 'set-boundary') && pendingConfirm.points.length >= 3) {
      dispatcher.execute({
        id: 'boundary.set',
        label: 'Set Campus Boundary',
        payload: { points: pendingConfirm.points },
      })
      clearDrawPoints()
      await workflow.save('manual')
      showImportToast({ message: 'Campus boundary updated', type: 'success' })
    }

    if (pendingConfirm.type === 'import-osm' && pendingConfirm.points.length >= 3) {
      setImporting(true)
      try {
        const res = await fetch('/api/osm-buildings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boundary: pendingConfirm.points }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const data = await res.json()
        const bldgs: Array<{ id: string; name?: string; footprint: Array<{ lat: number; lng: number }>; height: number; color: string }> = data.buildings ?? []
        let created = 0
        for (const b of bldgs) {
          const id = genId('bldg')
          const result = dispatcher.execute({
            id: 'building.create',
            label: 'Import Building',
            payload: {
              id,
              name: b.name || `Building ${b.id}`,
              code: '',
              footprint: { points: b.footprint },
              floors: [{ id: genId('flr'), level: 0, label: 'Ground Floor', elevation: 0, height: 3.5, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], metadata: {} }],
              height: b.height || 15,
              color: b.color || '#1C6BEB',
            },
          })
          if (!result || result.success !== false) created++
        }

        if (created !== bldgs.length) throw new Error('Failed to create buildings')
        if (created > 0) await workflow.save('manual')
        clearDrawPoints()
        clearPendingConfirm()
        showImportToast({
          message: created > 0 ? `Imported ${created} buildings from OSM` : 'No buildings found in selected boundary',
          type: 'success',
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        showImportToast({ message: `Import failed: ${message}`, type: 'error' })
      } finally {
        setImporting(false)
      }
      // Keep pending points and the confirmation overlay visible after an
      // error so the author can retry or cancel without redrawing.
      return
    }

    if (pendingConfirm.type === 'area' && pendingConfirm.points.length >= 3) {
      const id = genId('area')
      dispatcher.execute({
        id: 'area.create',
        label: 'Create Area',
        payload: {
          id,
          name: areaName || `Area ${id.slice(-6).toUpperCase()}`,
          points: pendingConfirm.points,
          color: areaColor,
        },
      })
      clearDrawPoints()
      await workflow.save('manual')
    }

    clearPendingConfirm()
  }

  const handleCancel = () => {
    if (pendingConfirm.type === 'route') {
      clearTracePoints()
      setTraceDisplayMode('visible')
    }
    clearDrawPoints()
    clearPendingConfirm()
  }

  const labels: Record<string, string> = {
    building: 'Building footprint',
    route: traceType === 'arterial' ? 'Arterial route' : 'Connector path',
    boundary: 'Boundary',
    'set-boundary': 'Campus boundary',
    'import-osm': 'Import from OSM',
    area: 'Area polygon',
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
            <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>MAP DISPLAY</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {([
                { value: 'visible' as const, label: 'Visible route' },
                { value: 'navigation-only' as const, label: 'Navigation-only route' },
              ]).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={traceDisplayMode === option.value}
                  onClick={() => setTraceDisplayMode(option.value)}
                  title={option.value === 'navigation-only' ? 'Keep this route usable for navigation without showing it on the normal map' : 'Show this route on the normal map'}
                  style={{
                    padding: '4px 8px', borderRadius: 4, border: '1px solid var(--navi-border)',
                    background: traceDisplayMode === option.value ? 'var(--navi-primary)' : 'transparent',
                    color: traceDisplayMode === option.value ? '#fff' : 'var(--navi-text-secondary)',
                    fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  }}
                >{option.label}</button>
              ))}
            </div>
            <div style={{ marginTop: 4, fontSize: 9, lineHeight: 1.35, color: 'var(--navi-text-secondary)' }}>
              Navigation-only routes stay in the graph but are hidden from the normal map.
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

      {pendingConfirm.type === 'area' && (
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
            <input value={areaName} onChange={(e) => setAreaName(e.target.value)}
              placeholder="e.g. Parking Lot A, Event Plaza"
              style={{
                padding: '5px 8px', borderRadius: 4, border: '1px solid var(--navi-border)',
                background: 'var(--navi-card)', color: 'var(--navi-text)', fontSize: 12, outline: 'none', width: '100%',
              }} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>COLOR</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {COLOR_SWATCHES.map((c) => (
                <button key={c} onClick={() => setAreaColor(c)}
                  style={{ width: 20, height: 20, borderRadius: 4, background: c, border: areaColor === c ? '2px solid var(--navi-text)' : '1px solid var(--navi-border)', cursor: 'pointer' }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {pendingConfirm.type !== 'route' && pendingConfirm.type !== 'area' && (
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
