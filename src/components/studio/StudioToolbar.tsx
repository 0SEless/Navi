'use client'

import { useEditor } from '@navi/editor'
import type { EditorMode } from '@navi/editor'

const MODES: EditorMode[] = ['campus', 'building', 'floor']

export function StudioToolbar() {
  const { services } = useEditor()
  const editingContext = services.get('editingContext')
  const mode = editingContext?.mode ?? 'campus'

  return (
    <div style={{
      background: 'var(--navi-card)', borderBottom: '1px solid var(--navi-border)',
      padding: '4px 14px', display: 'flex', alignItems: 'center',
      gap: 2, flexShrink: 0,
    }}>
      {MODES.map((m) => (
        <button key={m} onClick={() => editingContext?.setMode(m)}
          style={{
            padding: '3px 10px', borderRadius: 4, border: 'none',
            background: mode === m ? 'var(--navi-primary)' : 'transparent',
            color: mode === m ? 'white' : 'var(--navi-text-secondary)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >{m === 'campus' ? 'Campus' : m === 'building' ? 'Building' : 'Floor'}</button>
      ))}
    </div>
  )
}
