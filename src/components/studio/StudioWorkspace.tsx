'use client'

import { useEffect } from 'react'
import { useStudioStore } from '@/store/studio-store'
import { useGraphStore } from '@/store/graph-store'
import { LeftPanel } from './LeftPanel'
import { RightPanel } from './RightPanel'
import { StudioCanvas } from './StudioCanvas'
import { FloorTabs } from './FloorTabs'
import { ConfirmOverlay } from './ConfirmOverlay'

interface StudioWorkspaceProps {
  mapId: string
}

export function StudioWorkspace({ mapId }: StudioWorkspaceProps) {
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
        <StudioCanvas />
        <ConfirmOverlay />
      </div>
      <RightPanel />
    </div>
  )

  if (editorMode === 'floor') {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <FloorTabs />
        {mapContent}
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {mapContent}
    </div>
  )
}
