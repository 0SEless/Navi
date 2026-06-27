'use client'

import { LeftPanel } from './LeftPanel'
import { RightPanel } from './RightPanel'
import { StudioCanvas } from './StudioCanvas'

export function FloorEditor() {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <LeftPanel />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <StudioCanvas />
      </div>
      <RightPanel />
    </div>
  )
}
