'use client'

import { EditorBridge } from './EditorBridge'
import { ExplorerPanel } from './ExplorerPanel'
import { RightPanel } from './RightPanel'
import { StudioCanvas } from './StudioCanvas'
import { ConfirmOverlay } from './ConfirmOverlay'
import { useGraphStore } from '@/store/graph-store'
import { useEffect } from 'react'

interface StudioWorkspaceProps {
  mapId: string
  center?: { lat: number; lng: number }
}

export function StudioWorkspace({ center }: StudioWorkspaceProps) {
  const save = useGraphStore((s) => s.save)

  useEffect(() => {
    const interval = setInterval(() => save(), 30000)
    return () => clearInterval(interval)
  }, [save])

  const mapContent = (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <div style={{ width: 220, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
        <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb' }}>
          Explorer
        </div>
        <EditorBridge>
          <ExplorerPanel />
        </EditorBridge>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <StudioCanvas center={center} />
        <ConfirmOverlay />
      </div>
      <RightPanel />
    </div>
  )

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {mapContent}
    </div>
  )
}