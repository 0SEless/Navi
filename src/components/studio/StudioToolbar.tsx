'use client'

import { MousePointer2, Move, Pencil, Square, Route, MapPin, Building2, ArrowUpDown, DoorOpen, CornerUpRight } from 'lucide-react'
import { useStudioStore } from '@/store/studio-store'
import { useGraphStore } from '@/store/graph-store'
import type { StudioTool } from '@/types/studio-types'

const CAMPUS_TOOLS: { tool: StudioTool; icon: typeof MousePointer2; label: string; color: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select', color: '#1C6BEB' },
  { tool: 'move', icon: Move, label: 'Move', color: '#64748B' },
  { tool: 'trace', icon: Pencil, label: 'Trace', color: '#F59E0B' },
  { tool: 'route_test', icon: Route, label: 'Route', color: '#06B6D4' },
  { tool: 'building', icon: Building2, label: 'Building', color: '#8B5CF6' },
  { tool: 'boundary', icon: MapPin, label: 'Boundary', color: '#F97316' },
]

const FLOOR_TOOLS: { tool: StudioTool; icon: typeof MousePointer2; label: string; color: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select', color: '#1C6BEB' },
  { tool: 'room', icon: Square, label: 'Room', color: '#10B981' },
  { tool: 'entrance', icon: DoorOpen, label: 'Entrance', color: '#F59E0B' },
  { tool: 'stairs', icon: ArrowUpDown, label: 'Stairs', color: '#10B981' },
  { tool: 'elevator', icon: ArrowUpDown, label: 'Elevator', color: '#7C3AED' },
  { tool: 'hallway', icon: CornerUpRight, label: 'Hallway', color: '#F59E0B' },
]

const FLOOR_LABELS = ['GF', '1F', '2F', '3F', '4F', '5F', '6F', '7F', '8F', '9F', '10F', 'B1', 'B2', 'B3']

export function StudioToolbar() {
  const tool = useStudioStore((s) => s.tool)
  const setTool = useStudioStore((s) => s.setTool)
  const editorMode = useStudioStore((s) => s.editorMode)
  const setEditorMode = useStudioStore((s) => s.setEditorMode)
  const activeFloor = useStudioStore((s) => s.activeFloor)
  const setActiveFloor = useStudioStore((s) => s.setActiveFloor)
  const activeBuildingId = useStudioStore((s) => s.activeBuildingId)
  const building = useGraphStore((s) => s.graph.buildings.find((b) => b.id === activeBuildingId))
  const toolConfig = editorMode === 'floor' ? FLOOR_TOOLS : CAMPUS_TOOLS
  const floorCount = Array.isArray(building?.floors) ? building.floors.length : 1
  const floors = Array.from({ length: floorCount }, (_, i) => ({
    value: i,
    label: FLOOR_LABELS[i] ?? `${i}F`,
  }))

  return (
    <div style={{
      background: 'var(--navi-card)', borderBottom: '1px solid var(--navi-border)',
      padding: '6px 14px', display: 'flex', alignItems: 'center',
      gap: 6, flexShrink: 0, flexWrap: 'wrap',
    }}>
      <span style={{ color: 'var(--navi-primary)', fontSize: 12, fontWeight: 800, marginRight: 12, letterSpacing: '0.05em' }}>
        NAVI STUDIO
      </span>

      <div style={{ display: 'flex', gap: 2, background: 'var(--navi-content)', borderRadius: 6, padding: 2, marginRight: 8 }}>
        {(['campus', 'building', 'floor'] as const).map((m) => (
          <button key={m} onClick={() => setEditorMode(m)}
            style={{
              padding: '4px 10px', borderRadius: 4, border: 'none',
              background: editorMode === m ? 'var(--navi-primary)' : 'transparent',
              color: editorMode === m ? 'white' : 'var(--navi-text-secondary)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >{m === 'campus' ? 'Campus' : m === 'building' ? 'Building' : 'Floor'}</button>
        ))}
      </div>

      <div style={{ width: 1, height: 22, background: 'var(--navi-border)', margin: '0 4px' }} />

      {toolConfig.map(({ tool: t, icon: Icon, label, color }) => (
        <button key={t} title={label} onClick={() => setTool(t)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 5,
            border: `1px solid ${tool === t ? color : 'var(--navi-border)'}`,
            background: tool === t ? `${color}20` : 'transparent',
            color: tool === t ? color : 'var(--navi-text-secondary)',
            cursor: 'pointer', fontSize: 11,
            fontWeight: tool === t ? 600 : 400,
          }}
        ><Icon size={13} />{label}</button>
      ))}

      <div style={{ flex: 1 }} />

      <span style={{ color: 'var(--navi-text-secondary)', fontSize: 10, fontWeight: 600 }}>FLOOR:</span>
      {floors.map((f) => (
        <button key={f.value} onClick={() => setActiveFloor(f.value)}
          style={{
            width: 32, height: 24, borderRadius: 4,
            border: `1px solid ${activeFloor === f.value ? 'var(--navi-primary)' : 'var(--navi-border)'}`,
            background: activeFloor === f.value ? 'var(--navi-primary)' : 'transparent',
            color: activeFloor === f.value ? 'white' : 'var(--navi-text-secondary)',
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}
        >{f.label}</button>
      ))}
    </div>
  )
}
