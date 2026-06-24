'use client'

import { MousePointer2, Move, Pencil, Square, Package, Route } from 'lucide-react'
import { useStudioStore } from '@/store/studio-store'
import type { StudioTool } from '@/types/studio-types'

const TOOL_CONFIG: { tool: StudioTool; icon: typeof MousePointer2; label: string; color: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select', color: '#1C6BEB' },
  { tool: 'move', icon: Move, label: 'Move', color: '#64748B' },
  { tool: 'trace', icon: Pencil, label: 'Trace', color: '#F59E0B' },
  { tool: 'room', icon: Square, label: 'Room', color: '#10B981' },
  { tool: 'asset', icon: Package, label: 'Asset', color: '#8B5CF6' },
  { tool: 'route_test', icon: Route, label: 'Route', color: '#06B6D4' },
]

const FLOORS = [
  { value: 0, label: 'GF' },
  { value: 1, label: '1F' },
  { value: 2, label: '2F' },
  { value: 3, label: '3F' },
]

export function StudioToolbar() {
  const tool = useStudioStore((s) => s.tool)
  const setTool = useStudioStore((s) => s.setTool)
  const editorMode = useStudioStore((s) => s.editorMode)
  const setEditorMode = useStudioStore((s) => s.setEditorMode)
  const activeFloor = useStudioStore((s) => s.activeFloor)
  const setActiveFloor = useStudioStore((s) => s.setActiveFloor)

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

      {TOOL_CONFIG.map(({ tool: t, icon: Icon, label, color }) => (
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
      {FLOORS.map((f) => (
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
