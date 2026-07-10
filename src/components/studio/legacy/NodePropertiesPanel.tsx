'use client'

import { Pencil, X } from 'lucide-react'
import { useGraphStore } from '@/store/graph-store'
import { useStudioStore } from '@/store/studio-store'
import type { NavNode } from '@/types/nav-types'

interface NodePropertiesPanelProps {
  node: NavNode
  onClose: () => void
}

export function NodePropertiesPanel({ node, onClose }: NodePropertiesPanelProps) {
  const graph = useGraphStore((s) => s.graph)
  const setVertexEditing = useStudioStore((s) => s.setVertexEditing)
  const setSelectedNodeId = useStudioStore((s) => s.setSelectedNodeId)

  // Find traces this node belongs to
  const traceId = node.metadata?.traceId as string | undefined
  const traceIds = node.metadata?.traceIds as string[] | undefined
  const allTraceIds = traceIds ?? (traceId ? [traceId] : [])

  const relatedTraces = allTraceIds
    .map((tid) => graph.traces.find((t) => t.id === tid))
    .filter(Boolean) as NonNullable<typeof graph.traces[number]>[]

  const handleEditRoute = (traceId: string) => {
    setSelectedNodeId(null)
    setVertexEditing('trace', traceId)
  }

  const renderPosition = () => {
    const lat = node.position.lat.toFixed(6)
    const lng = node.position.lng.toFixed(6)
    return `${lat}, ${lng}`
  }

  return (
    <div style={{ borderTop: '1px solid var(--navi-border)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Node Properties
        </div>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navi-text-secondary)', display: 'flex', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      <div>
        <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>ID</div>
        <div style={{ fontSize: 10, color: 'var(--navi-text)', wordBreak: 'break-all', opacity: 0.7 }}>{node.id}</div>
      </div>

      <div>
        <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>TYPE</div>
        <div style={{ fontSize: 11, color: 'var(--navi-text)', fontWeight: 500 }}>{node.type}</div>
      </div>

      <div>
        <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>POSITION</div>
        <div style={{ fontSize: 11, color: 'var(--navi-text)', fontFamily: 'monospace' }}>{renderPosition()}</div>
      </div>

      <div>
        <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>FLOOR</div>
        <div style={{ fontSize: 11, color: 'var(--navi-text)', fontWeight: 500 }}>{node.floor}</div>
      </div>

      {relatedTraces.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>
            ROUTE{relatedTraces.length > 1 ? 'S' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {relatedTraces.map((trace) => (
              <div key={trace.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 6px', borderRadius: 4, background: 'var(--navi-content)',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: trace.color || '#FFFFFF', flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: 'var(--navi-text)', flex: 1 }}>
                  {trace.name || trace.id.slice(0, 8)}
                </span>
                <button onClick={() => handleEditRoute(trace.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '3px 8px', borderRadius: 4, border: '1px solid #F59E0B',
                    background: 'transparent', color: '#F59E0B',
                    fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  }}>
                  <Pencil size={10} /> Edit Vertices
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {relatedTraces.length === 0 && (
        <div style={{
          padding: '8px', borderRadius: 4, background: 'var(--navi-content)',
          fontSize: 10, color: 'var(--navi-text-secondary)',
        }}>
          This node is not part of any route. It may be a building component node (room, entrance, etc.).
        </div>
      )}
    </div>
  )
}
