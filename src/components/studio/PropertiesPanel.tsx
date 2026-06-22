'use client'

import { Info } from 'lucide-react'
import { useStudioStore } from '@/store/studio-store'
import { useGraphStore } from '@/store/graph-store'

export function PropertiesPanel() {
  const graph = useGraphStore((s) => s.graph)
  const activeBuildingId = useStudioStore((s) => s.activeBuildingId)
  const selectedBuilding = activeBuildingId ? graph.getBuilding(activeBuildingId) : null

  return (
    <div style={{
      width: 280, background: '#0D1526',
      borderLeft: '1px solid #1E3A5F',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid #1E293B',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Info size={13} color="#06B6D4" />
        <span style={{ color: '#94A3B8', fontSize: 11, fontWeight: 600 }}>
          {selectedBuilding ? 'Building Properties' : 'Properties'}
        </span>
      </div>

      {selectedBuilding ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ color: '#475569', fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', display: 'block', marginBottom: 3 }}>NAME</label>
            <input value={selectedBuilding.name} readOnly
              style={{ width: '100%', background: '#111827', border: '1px solid #1E3A5F', borderRadius: 5, padding: '6px 8px', color: '#E2E8F0', fontSize: 11 }} />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 11 }}>
          Select an item on the map
        </div>
      )}

      <div style={{ padding: '8px 14px', borderTop: '1px solid #1E293B', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {[
          { label: 'Buildings', value: graph.buildings.length },
          { label: 'Nodes', value: graph.nodes.length },
          { label: 'Edges', value: graph.edges.length },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#111827', borderRadius: 4, padding: '5px 6px', textAlign: 'center' }}>
            <div style={{ color: '#60A5FA', fontSize: 13, fontWeight: 700 }}>{value}</div>
            <div style={{ color: '#475569', fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
