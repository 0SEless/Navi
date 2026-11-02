'use client'

export interface TerrainLayers {
  buildings: boolean
  roads: boolean
  contours: boolean
  tracing: boolean
}

export const DEFAULT_LAYERS: TerrainLayers = { buildings: true, roads: true, contours: false, tracing: true }

/** Show/hide map layers; the tracing image is picked here and stays on this computer. */
export function TerrainLayersPanel({ layers, onLayers, hasTracing, tracingOpacity, onTracingFile, onTracingOpacity, onRemoveTracing }: {
  layers: TerrainLayers
  onLayers: (next: TerrainLayers) => void
  hasTracing: boolean
  tracingOpacity: number
  onTracingFile: (file: File) => void
  onTracingOpacity: (value: number) => void
  onRemoveTracing: () => void
}) {
  const toggle = (key: keyof TerrainLayers, label: string) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="checkbox" checked={layers[key]} onChange={(event) => onLayers({ ...layers, [key]: event.target.checked })} />
      {label}
    </label>
  )
  return (
    <div aria-label="Layers" style={{
      position: 'absolute', left: 12, bottom: 12, zIndex: 2, display: 'flex', flexDirection: 'column', gap: 4, padding: 10, fontSize: 12, width: 210,
      background: 'var(--navi-card, #fff)', border: '1px solid var(--navi-border, #e5e7eb)', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    }}>
      <strong>Layers</strong>
      {toggle('buildings', 'Buildings')}
      {toggle('roads', 'Roads and paths')}
      {toggle('contours', 'Contour lines')}
      {toggle('tracing', 'Tracing image')}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, color: 'var(--navi-text-secondary, #6b7280)' }}>
        Tracing image (this computer only)
        <input aria-label="Tracing image file" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onTracingFile(file) }} />
      </label>
      {hasTracing && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Opacity
            <input aria-label="Tracing image opacity" type="range" min={10} max={100} value={Math.round(tracingOpacity * 100)} onChange={(event) => onTracingOpacity(Number(event.target.value) / 100)} />
          </label>
          <button type="button" onClick={onRemoveTracing}>Remove tracing image</button>
        </>
      )}
    </div>
  )
}
