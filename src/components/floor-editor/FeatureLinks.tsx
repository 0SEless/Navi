'use client'

// Floor-to-floor connections of a stair or lift (2026-11-08), in the floor editor's properties panel: what it connects
// down to and up to, a choice among the same-kind items on that adjacent floor, and Disconnect.
import type { Building } from '@navi/core'
import { featureFloor, linkCandidates, type FeatureKind } from '@navi/editor'

const field: React.CSSProperties = {
  width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--navi-border)',
  background: 'var(--navi-content)', color: 'var(--navi-text)', fontSize: 11, boxSizing: 'border-box',
}
const label: React.CSSProperties = { fontSize: 10, color: 'var(--navi-text-secondary)', display: 'block', marginBottom: 2 }

export function FeatureLinks({ building, featureType, featureId, onLink, onUnlink }: {
  building: Building
  featureType: FeatureKind
  featureId: string
  /** Connect `lowerId` (floor below) to `upperId` (floor above). */
  onLink(lowerId: string, upperId: string): void
  onUnlink(side: 'below' | 'above'): void
}) {
  const items = (featureType === 'staircase' ? building.staircases : building.elevators) ?? []
  const feature = items.find((f) => f.id === featureId)
  if (!feature) return null
  const floorLabel = (level: number) => building.floors.find((f) => f.level === level)?.label ?? `Floor ${level}`
  const here = featureFloor(feature)
  const levels = Object.keys(feature.levels ?? {}).map(Number)
  const top = levels.length > 0 ? Math.max(...levels) : here
  const hasFloor = (level: number) => building.floors.some((f) => f.level === level)

  const line = (side: 'below' | 'above') => {
    const title = side === 'below' ? 'Connects down to' : 'Connects up to'
    const target = side === 'below' ? here - 1 : top + 1
    if (!hasFloor(target)) {
      return (
        <div key={side}>
          <span style={label}>{title.toUpperCase()}</span>
          <span style={{ fontSize: 11, color: 'var(--navi-text-secondary)' }}>{side === 'below' ? 'No floor below' : 'No floor above'}</span>
        </div>
      )
    }
    const current = feature.links?.[side] ?? ''
    const candidates = linkCandidates(building, featureType, featureId, side)
    return (
      <div key={side}>
        <label style={label} htmlFor={`link-${side}-${featureId}`}>{title.toUpperCase()}</label>
        <div style={{ display: 'flex', gap: 4 }}>
          <select
            id={`link-${side}-${featureId}`}
            aria-label={title}
            value={current}
            style={field}
            onChange={(event) => {
              const chosen = event.target.value
              if (!chosen) onUnlink(side)
              else if (side === 'below') onLink(chosen, featureId)
              else onLink(featureId, chosen)
            }}
          >
            <option value="">— not connected —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{`${floorLabel(target)} · ${c.name || c.id}`}</option>
            ))}
          </select>
          {current && (
            <button
              type="button"
              aria-label={side === 'below' ? 'Disconnect down' : 'Disconnect up'}
              onClick={() => onUnlink(side)}
              style={{ ...field, width: 'auto', cursor: 'pointer' }}
            >
              Disconnect
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="feature-links">
      {line('below')}
      {line('above')}
    </div>
  )
}
