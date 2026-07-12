'use client'

import { useEditor } from '@navi/editor'
import { EditorBridge } from './EditorBridge'
import { ExplorerPanel } from './ExplorerPanel'
import { PropertiesPanel } from '@navi/editor'
import { StudioCanvas } from './StudioCanvas'
import { StudioToolbar } from './StudioToolbar'
import { ConfirmOverlay } from './ConfirmOverlay'
import { useEffect } from 'react'

interface StudioWorkspaceProps {
  mapId: string
  center?: { lat: number; lng: number }
}

export function StudioWorkspace({ center }: StudioWorkspaceProps) {
  const { services } = useEditor()
  const workflow = services.get('workflow')
  if (!workflow) throw new Error('WorkflowService not registered')

  useEffect(() => {
    const interval = setInterval(() => workflow.save('autosave'), 30000)
    return () => clearInterval(interval)
  }, [workflow])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <EditorBridge>
        <StudioToolbar />
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ width: 220, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
            <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb' }}>
              Explorer
            </div>
            <ExplorerPanel />
          </div>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <StudioCanvas center={center} />
            <ConfirmOverlay />
          </div>
          <div style={{ width: 280, background: 'var(--navi-card)', borderLeft: '1px solid var(--navi-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
            <PropertiesPanel />
          </div>
        </div>
      </EditorBridge>
    </div>
  )
}
