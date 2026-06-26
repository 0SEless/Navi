'use client'

import { useStudioStore } from '@/store/studio-store'
import { useGraphStore } from '@/store/graph-store'
import { MetadataPanel } from './MetadataPanel'
import type { StudioTool, LayerVisibility } from '@/types/studio-types'
import {
  MousePointer2, Move, Pencil, Square, Package, Route, MapPin, Building2,
  Minus, Maximize, ArrowUpDown, Eye, EyeOff,
} from 'lucide-react'

const ALL_CAMPUS_TOOLS: { tool: StudioTool; icon: React.ElementType; label: string; color: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select', color: '#1C6BEB' },
  { tool: 'move', icon: Move, label: 'Move', color: '#64748B' },
  { tool: 'trace', icon: Pencil, label: 'Trace', color: '#F59E0B' },
  { tool: 'route_test', icon: Route, label: 'Route', color: '#06B6D4' },
  { tool: 'building', icon: Building2, label: 'Building', color: '#8B5CF6' },
  { tool: 'boundary', icon: MapPin, label: 'Boundary', color: '#F97316' },
]

const FLOOR_TOOLS: { tool: StudioTool; icon: React.ElementType; label: string; color: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select', color: '#1C6BEB' },
  { tool: 'move', icon: Move, label: 'Move', color: '#64748B' },
  { tool: 'trace', icon: Pencil, label: 'Trace', color: '#F59E0B' },
  { tool: 'room', icon: Square, label: 'Room', color: '#10B981' },
  { tool: 'asset', icon: Package, label: 'Asset', color: '#8B5CF6' },
  { tool: 'wall', icon: Minus, label: 'Wall', color: '#64748B' },
  { tool: 'door', icon: Maximize, label: 'Door', color: '#F59E0B' },
  { tool: 'stairs', icon: ArrowUpDown, label: 'Stairs', color: '#10B981' },
]

const LAYER_ITEMS: { key: keyof LayerVisibility; label: string; icon: React.ElementType }[] = [
  { key: 'osm', label: 'OSM Base', icon: Eye },
  { key: 'satellite', label: 'Satellite', icon: Eye },
  { key: 'buildings', label: 'Buildings', icon: Building2 },
  { key: 'rooms', label: 'Rooms', icon: Square },
  { key: 'hallways', label: 'Hallways', icon: Route },
  { key: 'assets', label: 'Assets', icon: Package },
  { key: 'nodes', label: 'Nodes', icon: MapPin },
  { key: 'edges', label: 'Edges', icon: Route },
  { key: 'labels', label: 'Labels', icon: Eye },
]

export function RightPanel() {
  const tool = useStudioStore((s) => s.tool)
  const setTool = useStudioStore((s) => s.setTool)
  const editorMode = useStudioStore((s) => s.editorMode)
  const layers = useStudioStore((s) => s.layers)
  const toggleLayer = useStudioStore((s) => s.toggleLayer)

  const tools = editorMode === 'floor' ? FLOOR_TOOLS : ALL_CAMPUS_TOOLS
  const activeBuilding = activeBuildingId ? buildings.find((b) => b.id === activeBuildingId) : null

  return (
    <div style={{
      width: 200,
      background: 'var(--navi-card)',
      borderLeft: '1px solid var(--navi-border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--navi-border)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Tools
        </div>
      </div>

      <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: 2, borderBottom: '1px solid var(--navi-border)' }}>
        {tools.map(({ tool: t, icon: Icon, label, color }) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: tool === t ? `${color}15` : 'transparent',
              color: tool === t ? color : 'var(--navi-text)',
              fontSize: 11,
              textAlign: 'left',
            }}
            onMouseEnter={(e) => { if (tool !== t) e.currentTarget.style.background = 'var(--navi-content)' }}
            onMouseLeave={(e) => { if (tool !== t) e.currentTarget.style.background = 'transparent' }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--navi-border)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          Layers
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {LAYER_ITEMS.map(({ key, label }) => {
            const active = layers[key]
            return (
              <button
                key={key}
                onClick={() => toggleLayer(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 6px',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: 'transparent',
                  color: active ? 'var(--navi-text)' : 'var(--navi-text-secondary)',
                  fontSize: 10,
                  textAlign: 'left',
                  opacity: active ? 1 : 0.5,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--navi-content)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                {active ? <Eye size={11} /> : <EyeOff size={11} />}
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <MetadataPanel />
    </div>
  )
}
