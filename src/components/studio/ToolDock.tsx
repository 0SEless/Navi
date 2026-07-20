'use client'

import {
  MousePointer2, Move, Building2, Route, Square, CornerUpRight,
  DoorOpen, QrCode, Camera, ArrowUpDown, Undo2, Redo2,
} from 'lucide-react'
import { useEditor } from '@navi/editor'

const ALL_TOOLS: { tool: string; icon: typeof MousePointer2; label: string; color: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select', color: '#1C6BEB' },
  { tool: 'pan', icon: Move, label: 'Pan', color: '#64748B' },
  { tool: 'draw-building', icon: Building2, label: 'Building', color: '#8B5CF6' },
  { tool: 'draw-road', icon: Route, label: 'Road', color: '#06B6D4' },
  { tool: 'draw-room', icon: Square, label: 'Room', color: '#10B981' },
  { tool: 'draw-hallway', icon: CornerUpRight, label: 'Hallway', color: '#F59E0B' },
  { tool: 'place-entrance', icon: DoorOpen, label: 'Entrance', color: '#F59E0B' },
  { tool: 'place-qr', icon: QrCode, label: 'QR', color: '#EC4899' },
  { tool: 'place-panorama', icon: Camera, label: 'Panorama', color: '#06B6D4' },
  { tool: 'place-staircase', icon: ArrowUpDown, label: 'Stairs', color: '#10B981' },
  { tool: 'place-elevator', icon: ArrowUpDown, label: 'Elevator', color: '#7C3AED' },
]

export function ToolDock() {
  const { services } = useEditor()
  const toolRegistry = services.get('toolRegistry')
  const history = services.get('history')
  const activeToolId = toolRegistry?.activeToolId ?? null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
      padding: '6px 14px',
      background: 'var(--navi-card)',
      borderTop: '1px solid var(--navi-border)',
      flexShrink: 0,
    }}>
      {ALL_TOOLS.map(({ tool: t, icon: Icon, label, color }) => (
        <button key={t} title={label} onClick={() => toolRegistry?.activate(t)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', borderRadius: 6,
            border: `1px solid ${activeToolId === t ? color : 'transparent'}`,
            background: activeToolId === t ? `${color}18` : 'transparent',
            color: activeToolId === t ? color : 'var(--navi-text-secondary)',
            cursor: 'pointer', fontSize: 11, fontWeight: activeToolId === t ? 600 : 400,
          }}
        ><Icon size={14} />{label}</button>
      ))}

      <div style={{ width: 1, height: 20, background: 'var(--navi-border)', margin: '0 6px' }} />

      <button onClick={() => history?.undo()} disabled={!history?.canUndo} title="Undo"
        style={{
          padding: '5px 8px', borderRadius: 6, border: 'none',
          background: 'transparent', color: history?.canUndo ? 'var(--navi-text-secondary)' : 'var(--navi-border)',
          cursor: history?.canUndo ? 'pointer' : 'not-allowed', fontSize: 11,
        }}
      ><Undo2 size={14} /></button>
      <button onClick={() => history?.redo()} disabled={!history?.canRedo} title="Redo"
        style={{
          padding: '5px 8px', borderRadius: 6, border: 'none',
          background: 'transparent', color: history?.canRedo ? 'var(--navi-text-secondary)' : 'var(--navi-border)',
          cursor: history?.canRedo ? 'pointer' : 'not-allowed', fontSize: 11,
        }}
      ><Redo2 size={14} /></button>
    </div>
  )
}
