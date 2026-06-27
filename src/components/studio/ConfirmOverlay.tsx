'use client'

import { Check, X } from 'lucide-react'
import { useStudioStore } from '@/store/studio-store'
import { useGraphStore } from '@/store/graph-store'
import { useCampusMapStore } from '@/store/campus-map-store'

export function ConfirmOverlay() {
  const pendingConfirm = useStudioStore((s) => s.pendingConfirm)
  const clearPendingConfirm = useStudioStore((s) => s.clearPendingConfirm)
  const tool = useStudioStore((s) => s.tool)
  const setTool = useStudioStore((s) => s.setTool)
  const setActiveBuilding = useStudioStore((s) => s.setActiveBuilding)
  const clearTracePoints = useStudioStore((s) => s.clearTracePoints)
  const activeFloor = useStudioStore((s) => s.activeFloor)
  const addBuilding = useGraphStore((s) => s.addBuilding)
  const addTrace = useGraphStore((s) => s.addTrace)
  const graph = useGraphStore((s) => s.graph)
  const currentMapId = useGraphStore((s) => s.currentMapId)
  const saveGraph = useGraphStore((s) => s.save)
  const updateMapStats = useCampusMapStore((s) => s.updateMapStats)

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
        floor: activeFloor,
        points: pendingConfirm.points,
        type: 'hallway',
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
    trace: 'Trace path',
    boundary: 'Boundary',
  }

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
