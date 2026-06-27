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
      width: 280, background: 'var(--navi-card)',
      borderLeft: '1px solid var(--navi-border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--navi-border)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Info size={13} color="var(--navi-primary)" />
        <span style={{ color: 'var(--navi-text-secondary)', fontSize: 11, fontWeight: 600 }}>
          {selectedBuilding ? 'Building Properties' : 'Properties'}
        </span>
      </div>

      {selectedBuilding ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ color: 'var(--navi-text-secondary)', fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', display: 'block', marginBottom: 3 }}>NAME</label>
            <input value={selectedBuilding.name} readOnly
              style={{ width: '100%', background: 'var(--navi-content)', border: '1px solid var(--navi-border)', borderRadius: 5, padding: '6px 8px', color: 'var(--navi-text)', fontSize: 11 }} />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navi-text-secondary)', fontSize: 11 }}>
          Select an item on the map
        </div>
      )}

      <div style={{ padding: '8px 14px', borderTop: '1px solid var(--navi-border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {[
          { label: 'Buildings', value: graph.buildingCount },
          { label: 'Nodes', value: graph.nodeCount },
          { label: 'Edges', value: graph.edgeCount },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--navi-content)', borderRadius: 4, padding: '5px 6px', textAlign: 'center' }}>
            <div style={{ color: 'var(--navi-primary)', fontSize: 13, fontWeight: 700 }}>{value}</div>
            <div style={{ color: 'var(--navi-text-secondary)', fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
