'use client'

import { MousePointer2, Move, Route, Building2, ArrowUpDown, DoorOpen, CornerUpRight, Square, Undo2, Redo2, Save, Rocket } from 'lucide-react'
import { useEditor } from '@navi/editor'
import type { EditorMode } from '@navi/editor'
import { useState, useEffect } from 'react'

const CAMPUS_TOOLS: { tool: string; icon: typeof MousePointer2; label: string; color: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select', color: '#1C6BEB' },
  { tool: 'pan', icon: Move, label: 'Move', color: '#64748B' },
  { tool: 'draw-road', icon: Route, label: 'Route', color: '#06B6D4' },
  { tool: 'draw-building', icon: Building2, label: 'Building', color: '#8B5CF6' },
]

const FLOOR_TOOLS: { tool: string; icon: typeof MousePointer2; label: string; color: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select', color: '#1C6BEB' },
  { tool: 'draw-room', icon: Square, label: 'Room', color: '#10B981' },
  { tool: 'place-entrance', icon: DoorOpen, label: 'Entrance', color: '#F59E0B' },
  { tool: 'place-staircase', icon: ArrowUpDown, label: 'Stairs', color: '#10B981' },
  { tool: 'place-elevator', icon: ArrowUpDown, label: 'Elevator', color: '#7C3AED' },
  { tool: 'draw-hallway', icon: CornerUpRight, label: 'Hallway', color: '#F59E0B' },
]

const FLOOR_LABELS = ['GF', '1F', '2F', '3F', '4F', '5F', '6F', '7F', '8F', '9F', '10F', 'B1', 'B2', 'B3']

const MODES: EditorMode[] = ['campus', 'building', 'floor']

export function StudioToolbar() {
  const { services, document } = useEditor()
  const toolRegistry = services.get('toolRegistry')
  const viewport = services.get('viewport')
  const editingContext = services.get('editingContext')
  const history = services.get('history')
  const workflow = services.get('workflow')

  const publishService = services.get('publish') as any
  const [publishState, setPublishState] = useState<string>('idle')
  const [publishError, setPublishError] = useState<string | null>(null)

  useEffect(() => {
    if (!publishService) return
    const unsub = publishService.getSnapshot
      ? () => {
          const snap = publishService.getSnapshot()
          setPublishState(snap.publishState)
          setPublishError(snap.publishError)
        }
      : () => {}
    const interval = setInterval(() => {
      if (publishService.getSnapshot) {
        const snap = publishService.getSnapshot()
        setPublishState(snap.publishState)
        setPublishError(snap.publishError)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [publishService])

  const mode = editingContext?.mode ?? 'campus'
  const activeToolId = toolRegistry?.activeToolId ?? null
  const activeBuildingId = viewport?.activeBuildingId ?? null
  const activeFloorId = viewport?.activeFloorId ?? null
  const building = document.buildings.find((b) => b.id === activeBuildingId)

  const toolConfig = mode === 'floor' ? FLOOR_TOOLS : CAMPUS_TOOLS
  const floors = building?.floors ?? []

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
        {MODES.map((m) => (
          <button key={m} onClick={() => editingContext?.setMode(m)}
            style={{
              padding: '4px 10px', borderRadius: 4, border: 'none',
              background: mode === m ? 'var(--navi-primary)' : 'transparent',
              color: mode === m ? 'white' : 'var(--navi-text-secondary)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >{m === 'campus' ? 'Campus' : m === 'building' ? 'Building' : 'Floor'}</button>
        ))}
      </div>

      <div style={{ width: 1, height: 22, background: 'var(--navi-border)', margin: '0 4px' }} />

      {toolConfig.map(({ tool: t, icon: Icon, label, color }) => (
        <button key={t} title={label} onClick={() => toolRegistry?.activate(t)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 5,
            border: `1px solid ${activeToolId === t ? color : 'var(--navi-border)'}`,
            background: activeToolId === t ? `${color}20` : 'transparent',
            color: activeToolId === t ? color : 'var(--navi-text-secondary)',
            cursor: 'pointer', fontSize: 11,
            fontWeight: activeToolId === t ? 600 : 400,
          }}
        ><Icon size={13} />{label}</button>
      ))}

      <div style={{ flex: 1 }} />

      {floors.length > 0 && (
        <>
          <span style={{ color: 'var(--navi-text-secondary)', fontSize: 10, fontWeight: 600 }}>FLOOR:</span>
          {floors.map((f) => {
            const label = FLOOR_LABELS[f.level] ?? f.label ?? `${f.level}F`
            return (
              <button key={f.id} onClick={() => viewport?.setActiveFloor(f.id)}
                style={{
                  width: 32, height: 24, borderRadius: 4,
                  border: `1px solid ${activeFloorId === f.id ? 'var(--navi-primary)' : 'var(--navi-border)'}`,
                  background: activeFloorId === f.id ? 'var(--navi-primary)' : 'transparent',
                  color: activeFloorId === f.id ? 'white' : 'var(--navi-text-secondary)',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                }}
              >{label}</button>
            )
          })}
        </>
      )}

      <div style={{ width: 1, height: 22, background: 'var(--navi-border)', margin: '0 4px' }} />

      <button onClick={() => history?.undo()} disabled={!history?.canUndo}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 4,
          border: '1px solid var(--navi-border)', background: 'transparent',
          color: history?.canUndo ? 'var(--navi-text-secondary)' : 'var(--navi-border)',
          fontSize: 11, cursor: history?.canUndo ? 'pointer' : 'not-allowed',
        }}
      ><Undo2 size={13} /> Undo</button>
      <button onClick={() => history?.redo()} disabled={!history?.canRedo}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 4,
          border: '1px solid var(--navi-border)', background: 'transparent',
          color: history?.canRedo ? 'var(--navi-text-secondary)' : 'var(--navi-border)',
          fontSize: 11, cursor: history?.canRedo ? 'pointer' : 'not-allowed',
        }}
      ><Redo2 size={13} /> Redo</button>

      <button onClick={() => void workflow?.save('manual')}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 4,
          border: '1px solid var(--navi-primary)',
          background: workflow?.isDirty() ? 'var(--navi-primary)' : 'transparent',
          color: workflow?.isDirty() ? 'white' : 'var(--navi-primary)',
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}
      ><Save size={13} /> {workflow?.isDirty() ? 'Save*' : 'Save'}</button>

      <button
        onClick={() => { publishService?.publish(); }}
        disabled={publishState === 'compiling' || publishState === 'uploading' || publishState === 'preparing'}
        title={publishError ?? 'Publish campus'}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 4,
          border: '1px solid var(--navi-primary)',
          background: publishState === 'success' ? 'var(--navi-primary)' : 'transparent',
          color: publishState === 'success' ? 'white' : 'var(--navi-primary)',
          fontSize: 11, fontWeight: 600, cursor: publishState === 'compiling' ? 'not-allowed' : 'pointer',
        }}
      ><Rocket size={13} /> {publishState === 'success' ? 'Published' : publishState === 'error' ? 'Error' : publishState === 'compiling' ? 'Compiling...' : publishState === 'uploading' ? 'Uploading...' : 'Publish'}</button>
    </div>
  )
}
