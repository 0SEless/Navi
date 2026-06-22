'use client'

import { StudioCanvas } from './StudioCanvas'
import { StudioToolbar } from './StudioToolbar'
import { LayersPanel } from './LayersPanel'
import { PropertiesPanel } from './PropertiesPanel'

export function StudioWorkspace() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0A0F1E' }}>
      <StudioToolbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <LayersPanel />
        <StudioCanvas />
        <PropertiesPanel />
      </div>
    </div>
  )
}
