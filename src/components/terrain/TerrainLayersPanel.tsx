'use client'

import type { TerrainLayers } from '@/lib/terrain/terrain-layers'
import { secondaryButton } from './form-styles'

export { DEFAULT_LAYERS, type TerrainLayers } from '@/lib/terrain/terrain-layers'

/** The layers that are switched on or off (not the see-through amounts). */
type OnOffLayer = { [K in keyof TerrainLayers]: TerrainLayers[K] extends boolean ? K : never }[keyof TerrainLayers]
type AmountLayer = 'streetMapOpacity' | 'groundOpacity'

const ROWS: Array<{ key: OnOffLayer; label: string; amount?: AmountLayer; amountLabel?: string }> = [
  { key: 'streetMap', label: 'Street map', amount: 'streetMapOpacity', amountLabel: 'Street map opacity' },
  { key: 'ground', label: 'Ground', amount: 'groundOpacity', amountLabel: 'Ground opacity' },
  { key: 'contours', label: 'Contour lines' },
  { key: 'buildings', label: 'Buildings' },
  { key: 'roads', label: 'Roads and paths' },
  { key: 'structures', label: 'Stairs and ramps' },
  { key: 'boundary', label: 'Boundary' },
  { key: 'tracing', label: 'Tracing image' },
]

function Eye({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M3 3l18 18" />}
    </svg>
  )
}

/** Section 5: the left panel, like Studio's Explorer. Each layer has an eye; the tracing image stays on this computer. */
export function TerrainLayersPanel({ layers, onLayers, hasTracing, tracingOpacity, onTracingFile, onTracingOpacity, onRemoveTracing }: {
  layers: TerrainLayers
  onLayers: (next: TerrainLayers) => void
  hasTracing: boolean
  tracingOpacity: number
  onTracingFile: (file: File) => void
  onTracingOpacity: (value: number) => void
  onRemoveTracing: () => void
}) {
  return (
    <section aria-label="Layers" style={{
      position: 'absolute', left: 0, top: 0, bottom: 0, width: 240, zIndex: 2, display: 'flex', flexDirection: 'column', gap: 2,
      padding: '12px 10px', fontSize: 13, overflowY: 'auto',
      background: 'var(--navi-card, #fff)', borderRight: '1px solid var(--navi-border, #e5e7eb)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: 'var(--navi-text-secondary, #6b7280)', padding: '0 4px 8px' }}>LAYERS</div>
      {ROWS.map((row) => {
        const on = layers[row.key]
        return (
          <div key={row.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px', borderRadius: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button" aria-label={row.label} aria-pressed={on} title={on ? `Hide ${row.label.toLowerCase()}` : `Show ${row.label.toLowerCase()}`}
                onClick={() => onLayers({ ...layers, [row.key]: !on })}
                style={{ display: 'flex', border: 'none', background: 'transparent', padding: 2, cursor: 'pointer', color: on ? 'var(--navi-primary, #2563eb)' : 'var(--navi-text-secondary, #9ca3af)' }}
              >
                <Eye open={on} />
              </button>
              <span style={{ color: on ? 'var(--navi-text, #111827)' : 'var(--navi-text-secondary, #9ca3af)' }}>{row.label}</span>
            </div>
            {row.amount && on && (
              <input
                aria-label={row.amountLabel} type="range" min={0} max={100} value={Math.round(layers[row.amount] * 100)}
                onChange={(event) => onLayers({ ...layers, [row.amount as AmountLayer]: Number(event.target.value) / 100 })}
                style={{ marginLeft: 28, width: 'calc(100% - 32px)' }}
              />
            )}
          </div>
        )
      })}
      <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--navi-border, #e5e7eb)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--navi-text-secondary, #6b7280)' }}>
          Tracing image (this computer only)
          <input aria-label="Tracing image file" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onTracingFile(file) }} />
        </label>
        {hasTracing && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Opacity
              <input aria-label="Tracing image opacity" type="range" min={10} max={100} value={Math.round(tracingOpacity * 100)} onChange={(event) => onTracingOpacity(Number(event.target.value) / 100)} />
            </label>
            <button type="button" style={secondaryButton} onClick={onRemoveTracing}>Remove tracing image</button>
          </>
        )}
      </div>
    </section>
  )
}
