'use client'

import { Undo2, Redo2 } from 'lucide-react'
import { useEditor, ToolDock as EditorToolDock, CAMPUS_TOOL_GROUPS } from '@navi/editor'
import { useCurrentTool } from './useCurrentTool'

export function ToolDock() {
  const { services } = useEditor()
  const toolRegistry = services.get('toolRegistry')
  const history = services.get('history')
  const activeToolId = useCurrentTool()

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
      padding: '6px 14px',
      background: 'var(--navi-card)',
      borderTop: '1px solid var(--navi-border)',
      flexShrink: 0,
    }}>
      <EditorToolDock groups={CAMPUS_TOOL_GROUPS} activeTool={activeToolId} onActivateTool={(id) => toolRegistry?.activate(id)} />

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
