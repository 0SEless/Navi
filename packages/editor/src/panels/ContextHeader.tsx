'use client'

import React from 'react'

export interface ContextHeaderProps {
  mapId: string
  buildingName: string
  floorLabel: string
  status: 'saved' | 'saving' | 'unsaved' | 'error'
  statusMessage?: string
  selectedCount?: number
}

const STATUS_CONFIG: Record<ContextHeaderProps['status'], { color: string; label: string }> = {
  saved: { color: '#10B981', label: 'Saved' },
  saving: { color: '#F59E0B', label: 'Saving\u2026' },
  unsaved: { color: '#6B7280', label: 'Unsaved' },
  error: { color: '#EF4444', label: 'Sync failed' },
}

export function ContextHeader({ mapId, buildingName, floorLabel, status, statusMessage, selectedCount }: ContextHeaderProps) {
  const cfg = STATUS_CONFIG[status]

  return (
    <div style={{
      background: 'var(--navi-card)', borderBottom: '1px solid var(--navi-border)',
      padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
    }}>
      <a href={`/studio/${mapId}/edit`} style={{
        display: 'flex', alignItems: 'center', gap: 4, color: 'var(--navi-text-secondary)',
        fontSize: 11, textDecoration: 'none', padding: '4px 8px', borderRadius: 4,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
        Campus
      </a>

      <div style={{ width: 1, height: 22, background: 'var(--navi-border)', margin: '0 4px' }} />

      <span style={{ fontSize: 11, color: 'var(--navi-text-secondary)' }}>
        {buildingName}
      </span>
      <span style={{ fontSize: 11, color: 'var(--navi-text-tertiary, #64748B)' }}>/</span>
      <span style={{ fontSize: 11, color: 'var(--navi-text-secondary)' }}>
        {floorLabel}
      </span>

      <div style={{ flex: 1 }} />

      {selectedCount && selectedCount > 1 ? (
        <span style={{ fontSize: 10, color: 'var(--navi-text-secondary)', background: 'var(--navi-content, #F1F5F9)', padding: '2px 8px', borderRadius: 10 }}>
          {selectedCount} selected
        </span>
      ) : null}

      <span style={{ fontSize: 10, color: cfg.color }} title={statusMessage ?? ''}>
        {'\u25CF'} {cfg.label}
      </span>
    </div>
  )
}
