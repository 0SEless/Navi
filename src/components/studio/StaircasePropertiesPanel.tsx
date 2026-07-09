'use client'

import { Trash2, X } from 'lucide-react'
import { useGraphStore } from '@/store/graph-store'
import { useStudioStore } from '@/store/studio-store'
import type { Staircase } from '@/types/nav-types'

interface StaircasePropertiesPanelProps {
  staircase: Staircase
  onClose: () => void
}

export function StaircasePropertiesPanel({ staircase, onClose }: StaircasePropertiesPanelProps) {
  const removeStaircase = useGraphStore((s) => s.removeStaircase)
  const save = useGraphStore((s) => s.save)

  const handleDelete = () => {
    removeStaircase(staircase.id)
    save()
    onClose()
  }

  return (
    <div style={{ borderTop: '1px solid var(--navi-border)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Staircase Properties
        </div>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navi-text-secondary)', display: 'flex', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      <div>
        <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>NAME</div>
        <div style={{ fontSize: 11, color: 'var(--navi-text)', fontWeight: 500 }}>{staircase.name}</div>
      </div>

      <div>
        <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>HEIGHT</div>
        <div style={{ fontSize: 11, color: 'var(--navi-text)', fontWeight: 500 }}>{staircase.height}m</div>
      </div>

      <div>
        <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>COLOR</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: staircase.color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--navi-text)', fontFamily: 'monospace' }}>{staircase.color}</span>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>FOOTPRINT</div>
        <div style={{ fontSize: 10, color: 'var(--navi-text)', fontFamily: 'monospace' }}>
          {staircase.footprint.length} points · center {staircase.center.lat.toFixed(4)}, {staircase.center.lng.toFixed(4)}
        </div>
      </div>

      {staircase.iconUrl && (
        <div>
          <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', marginBottom: 3 }}>ICON</div>
          <div style={{ fontSize: 10, color: 'var(--navi-text)', wordBreak: 'break-all' }}>{staircase.iconUrl}</div>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--navi-border)', paddingTop: 8, marginTop: 'auto' }}>
        <button onClick={handleDelete}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 6, border: '1px solid #EF4444',
            background: 'transparent', color: '#EF4444', fontSize: 11,
            fontWeight: 600, cursor: 'pointer', width: '100%',
            justifyContent: 'center',
          }}>
          <Trash2 size={12} /> Delete Staircase
        </button>
      </div>
    </div>
  )
}
