'use client'

import { X } from 'lucide-react'
import { useStudioStore } from '@/store/studio-store'

const FLOORS = [
  { value: 0, label: 'GF' },
  { value: 1, label: '1F' },
  { value: 2, label: '2F' },
  { value: 3, label: '3F' },
]

export function FloorTabs() {
  const activeFloor = useStudioStore((s) => s.activeFloor)
  const setActiveFloor = useStudioStore((s) => s.setActiveFloor)
  const setEditorMode = useStudioStore((s) => s.setEditorMode)
  const activeBuildingId = useStudioStore((s) => s.activeBuildingId)

  return (
    <div style={{
      background: 'var(--navi-card)', borderBottom: '1px solid var(--navi-border)',
      padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
    }}>
      <span style={{ color: 'var(--navi-text-secondary)', fontSize: 10, fontWeight: 600, marginRight: 8 }}>
        FLOOR EDITOR{activeBuildingId ? ` — ${activeBuildingId.slice(0, 8)}` : ''}
      </span>
      {FLOORS.map((f) => (
        <button key={f.value} onClick={() => setActiveFloor(f.value)}
          style={{
            padding: '4px 12px', borderRadius: 4, border: 'none',
            background: activeFloor === f.value ? 'var(--navi-primary)' : 'transparent',
            color: activeFloor === f.value ? 'white' : 'var(--navi-text-secondary)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >{f.label}</button>
      ))}
      <div style={{ flex: 1 }} />
      <button onClick={() => setEditorMode('campus')}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 4, border: '1px solid var(--navi-border)',
          background: 'transparent', color: 'var(--navi-text-secondary)',
          fontSize: 11, cursor: 'pointer',
        }}
      ><X size={12} /> Exit Floor Edit</button>
    </div>
  )
}
