'use client'

import { useEffect } from 'react'
import { useGraphStore } from '@/store/graph-store'
import { LeftPanel } from './LeftPanel'
import { RightPanel } from './RightPanel'
import { StudioCanvas } from './StudioCanvas'
import { ConfirmOverlay } from './ConfirmOverlay'

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
      <LeftPanel />
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
