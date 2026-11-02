'use client'

import type { ReactNode } from 'react'
import type { CampusTerrain } from '@navi/core'

export function TerrainTopBar({ terrain, saving, onDone, extras }: { terrain?: CampusTerrain; saving: boolean; onDone: () => void; extras?: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '0 14px', height: 40, flexShrink: 0,
      background: 'var(--navi-card, #fff)', borderBottom: '1px solid var(--navi-border, #e5e7eb)',
    }}>
      <span style={{ color: 'var(--navi-primary, #2563eb)', fontSize: 12, fontWeight: 800, letterSpacing: '0.05em' }}>TERRAIN</span>
      {terrain && (
        <span title="Height reference" style={{ fontSize: 12, color: 'var(--navi-text-secondary, #6b7280)' }}>
          <strong style={{ color: 'var(--navi-text, #111827)' }}>{terrain.reference.name}</strong>
          {` · 0 m = ${terrain.reference.zeroMeaning}`}
        </span>
      )}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>{extras}</div>
      <button
        type="button"
        onClick={onDone}
        disabled={saving}
        style={{
          padding: '4px 14px', borderRadius: 4, border: 'none', fontSize: 12, fontWeight: 600,
          background: 'var(--navi-primary, #2563eb)', color: 'white', cursor: saving ? 'default' : 'pointer',
        }}
      >
        {saving ? 'Saving…' : 'Done'}
      </button>
    </div>
  )
}
