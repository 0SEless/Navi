'use client'

import { useState, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useGraphStore } from '@/store/graph-store'
import { FloorOutliner } from './FloorOutliner'
import { ComponentProperties } from './ComponentProperties'
import type { StudioTool, LayerVisibility } from '@/types/studio-types'

const FloorEditorCanvas = dynamic(
  () => import('./FloorEditorCanvas').then((m) => m.FloorEditorCanvas),
  { ssr: false, loading: () => <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 12 }}>Loading map…</div> }
)
import {
  MousePointer2, Square, ArrowUpDown, Eye, EyeOff,
  DoorOpen, CornerUpRight,
} from 'lucide-react'

interface FloorEditorProps {
  mapId: string
  buildingId: string
  floor: number
}

const FLOOR_TOOLS: { tool: StudioTool; icon: React.ElementType; label: string; color: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select', color: '#1C6BEB' },
  { tool: 'room', icon: Square, label: 'Room', color: '#10B981' },
  { tool: 'entrance', icon: DoorOpen, label: 'Entrance', color: '#F59E0B' },
  { tool: 'stairs', icon: ArrowUpDown, label: 'Stairs', color: '#10B981' },
  { tool: 'elevator', icon: ArrowUpDown, label: 'Elevator', color: '#7C3AED' },
  { tool: 'hallway', icon: CornerUpRight, label: 'Hallway', color: '#F59E0B' },
]

const LAYER_ITEMS: { key: keyof LayerVisibility; label: string }[] = [
  { key: 'floor_plan', label: 'Floor Plan' },
  { key: 'rooms', label: 'Rooms' },
  { key: 'hallways', label: 'Hallways' },
  { key: 'assets', label: 'Assets' },
  { key: 'nodes', label: 'Nodes' },
  { key: 'edges', label: 'Edges' },
  { key: 'labels', label: 'Labels' },
]

export function FloorEditor({ mapId, buildingId, floor }: FloorEditorProps) {
  const graph = useGraphStore((s) => s.graph)
  const building = useMemo(() => graph.buildings.find((b) => b.id === buildingId), [graph.buildings, buildingId])

  const [tool, setTool] = useState<StudioTool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const handleToolChange = useCallback((t: StudioTool) => { setTool(t); setSelectedId(null) }, [])
  const handleSelect = useCallback((id: string | null) => setSelectedId(id), [])
  const [layers, setLayers] = useState<LayerVisibility>({
    osm: false, satellite: false, floor_plan: true, buildings: false,
    rooms: true, hallways: true, assets: true, nodes: false, edges: false, labels: true,
  })

  const toggleLayer = (key: keyof LayerVisibility) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (!building) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navi-text-secondary)', fontSize: 13 }}>
        Building not found
      </div>
    )
  }

  const floorLabel = floor === 0 ? 'GF' : floor > 0 ? `${floor}F` : `${floor}F`

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        background: 'var(--navi-card)', borderBottom: '1px solid var(--navi-border)',
        padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        <Link href={`/studio/${mapId}/edit`} style={{
          display: 'flex', alignItems: 'center', gap: 4, color: 'var(--navi-text-secondary)',
          fontSize: 11, textDecoration: 'none', padding: '4px 8px', borderRadius: 4,
        }}>
          <ArrowLeft size={14} /> Back to Map
        </Link>
        <div style={{ width: 1, height: 22, background: 'var(--navi-border)', margin: '0 4px' }} />
        <span style={{ color: 'var(--navi-primary)', fontSize: 12, fontWeight: 800, letterSpacing: '0.05em' }}>
          FLOOR EDITOR
        </span>
        <span style={{ fontSize: 11, color: 'var(--navi-text-secondary)' }}>
          — {building.name} — {floorLabel}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <FloorOutliner building={building} activeFloor={floor} mapId={mapId} selectedId={selectedId} onSelect={handleSelect} />

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <FloorEditorCanvas building={building} floor={floor} tool={tool} layers={layers} selectedId={selectedId} onSelect={handleSelect} />
          {!building.floorPlanUrls?.[floor] && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#0F172A', color: '#475569', fontSize: 13, fontWeight: 500, pointerEvents: 'none', zIndex: 10,
            }}>
              Upload a floor plan image in the Building panel to begin editing
            </div>
          )}
        </div>

        <div style={{
          width: 220, background: 'var(--navi-card)', borderLeft: '1px solid var(--navi-border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
        }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--navi-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tools
            </div>
          </div>

          <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: 2, borderBottom: '1px solid var(--navi-border)' }}>
            {FLOOR_TOOLS.map(({ tool: t, icon: Icon, label, color }) => (
              <button key={t} onClick={() => handleToolChange(t)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6,
                  border: 'none', cursor: 'pointer',
                  background: tool === t ? `${color}15` : 'transparent',
                  color: tool === t ? color : 'var(--navi-text)', fontSize: 11, textAlign: 'left',
                }}
                onMouseEnter={(e) => { if (tool !== t) e.currentTarget.style.background = 'var(--navi-content)' }}
                onMouseLeave={(e) => { if (tool !== t) e.currentTarget.style.background = 'transparent' }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Layers
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {LAYER_ITEMS.map(({ key, label }) => {
                const active = layers[key]
                return (
                  <button key={key} onClick={() => toggleLayer(key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 4,
                      border: 'none', cursor: 'pointer', background: 'transparent',
                      color: active ? 'var(--navi-text)' : 'var(--navi-text-secondary)',
                      fontSize: 10, textAlign: 'left', opacity: active ? 1 : 0.5,
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

          {selectedId && (
            <ComponentProperties key={selectedId} componentId={selectedId} onClose={() => setSelectedId(null)} />
          )}
        </div>
      </div>
    </div>
  )
}
