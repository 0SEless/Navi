'use client'

import type { TerrainView } from '@/lib/terrain/terrain-view'

const VIEWS: Array<{ id: TerrainView; label: string }> = [
  { id: 'heights', label: 'Heights' },
  { id: 'changes', label: 'Changes' },
  { id: 'contours', label: 'Contours' },
]

export function TerrainViewControls({ view, exaggeration, onView, onExaggeration, threeD = false, onThreeD }: {
  view: TerrainView
  exaggeration: number
  onView: (view: TerrainView) => void
  onExaggeration: (value: number) => void
  /** Whether the map is tilted (3D); the button tilts or flattens it. */
  threeD?: boolean
  onThreeD?: () => void
}) {
  return (
    <>
      {onThreeD && (
        <button
          type="button"
          aria-pressed={threeD}
          title={threeD ? 'Back to the flat top view' : 'Tilt to 3D (or right-drag the map)'}
          onClick={onThreeD}
          style={{
            padding: '3px 10px', fontSize: 11, fontWeight: 600, borderRadius: 4, cursor: 'pointer',
            border: '1px solid var(--navi-border, #e5e7eb)',
            background: threeD ? 'var(--navi-primary, #2563eb)' : 'transparent',
            color: threeD ? 'white' : 'var(--navi-text-secondary, #6b7280)',
          }}
        >
          3D
        </button>
      )}
      <div role="group" aria-label="Terrain view" style={{ display: 'flex', border: '1px solid var(--navi-border, #e5e7eb)', borderRadius: 4, overflow: 'hidden' }}>
        {VIEWS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={view === option.id}
            onClick={() => onView(option.id)}
            style={{
              padding: '3px 10px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: view === option.id ? 'var(--navi-primary, #2563eb)' : 'transparent',
              color: view === option.id ? 'white' : 'var(--navi-text-secondary, #6b7280)',
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--navi-text-secondary, #6b7280)' }}>
        Height ×{exaggeration}
        <input
          aria-label="Height exaggeration"
          type="range"
          min={1}
          max={5}
          step={1}
          value={exaggeration}
          onChange={(event) => onExaggeration(Number(event.target.value))}
        />
      </label>
    </>
  )
}
