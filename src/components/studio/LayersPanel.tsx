'use client'

import { Layers, Eye, EyeOff, Building2, Map, Route, Grid3X3, Package } from 'lucide-react'
import { useStudioStore } from '@/store/studio-store'
import type { LayerVisibility } from '@/types/studio-types'

const LAYER_CONFIG: { key: keyof LayerVisibility; label: string; icon: typeof Layers }[] = [
  { key: 'osm', label: 'OSM Base', icon: Map },
  { key: 'satellite', label: 'Satellite', icon: Map },
  { key: 'floor_plan', label: 'Floor Plan', icon: Grid3X3 },
  { key: 'buildings', label: 'Buildings', icon: Building2 },
  { key: 'rooms', label: 'Rooms', icon: Grid3X3 },
  { key: 'hallways', label: 'Hallways', icon: Route },
  { key: 'assets', label: 'Assets', icon: Package },
  { key: 'nodes', label: 'Nodes', icon: Route },
  { key: 'edges', label: 'Edges', icon: Route },
  { key: 'labels', label: 'Labels', icon: Layers },
]

export function LayersPanel() {
  const layers = useStudioStore((s) => s.layers)
  const toggleLayer = useStudioStore((s) => s.toggleLayer)

  return (
    <div style={{
      width: 220, background: '#0D1526',
      borderRight: '1px solid #1E3A5F',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid #1E293B',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Layers size={13} color="#06B6D4" />
        <span style={{ color: '#94A3B8', fontSize: 11, fontWeight: 600 }}>LAYERS</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {LAYER_CONFIG.map(({ key, label, icon: Icon }) => (
          <div key={key} onClick={() => toggleLayer(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', cursor: 'pointer',
              color: layers[key] ? '#E2E8F0' : '#475569',
              fontSize: 11,
            }}
          >
            <Icon size={12} color={layers[key] ? '#1C6BEB' : '#334155'} />
            <span style={{ flex: 1 }}>{label}</span>
            {layers[key] ? <Eye size={12} color="#1C6BEB" /> : <EyeOff size={12} />}
          </div>
        ))}
      </div>
    </div>
  )
}
