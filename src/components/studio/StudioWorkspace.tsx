'use client'

import { useEffect } from 'react'
import { useStudioStore } from '@/store/studio-store'
import { useGraphStore } from '@/store/graph-store'
import { LeftPanel } from './LeftPanel'
import { RightPanel } from './RightPanel'
import { StudioCanvas } from './StudioCanvas'
import { ConfirmOverlay } from './ConfirmOverlay'

interface StudioWorkspaceProps {
  mapId: string
  center?: { lat: number; lng: number }
}

export function StudioWorkspace({ mapId, center }: StudioWorkspaceProps) {
  const editorMode = useStudioStore((s) => s.editorMode)
  const save = useGraphStore((s) => s.save)

  console.log('[StudioWorkspace] render', { mapId, editorMode })

  useEffect(() => {
    const interval = setInterval(() => save(), 30000)
    return () => clearInterval(interval)
  }, [save])

  const mapContent = (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <LeftPanel />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <StudioCanvas center={center} />
        <ConfirmOverlay />
      </div>
      <RightPanel mapId={mapId} />
    </div>
  )

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {mapContent}
    </div>
  )
}
