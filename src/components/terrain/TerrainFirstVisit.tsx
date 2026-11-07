'use client'

import { useState } from 'react'
import { TerrainImportPanel } from './TerrainImportPanel'
import { primaryButton, secondaryButton, textInput, withDisabled } from './form-styles'

type Mode = 'choose' | 'import' | 'flat' | 'trace'

const card: React.CSSProperties = {
  width: 220, padding: 16, borderRadius: 8, border: '1px solid var(--navi-border, #e5e7eb)', background: 'var(--navi-card, #fff)',
  textAlign: 'left', cursor: 'pointer',
}

/** No terrain yet: Import ground, Trace contours over a tracing image, or Start flat (name the reference). */
export function TerrainFirstVisit({ readOnly, onSetup }: { readOnly: boolean; onSetup: (payload: Record<string, unknown>) => void }) {
  const [mode, setMode] = useState<Mode>('choose')
  const [name, setName] = useState('')
  const [zero, setZero] = useState('')

  if (readOnly) {
    return <div style={{ padding: 32, fontSize: 13, color: 'var(--navi-text-secondary, #6b7280)' }}>This campus has no terrain yet.</div>
  }

  if (mode === 'import') {
    return (
      <div style={{ padding: 32 }}>
        <TerrainImportPanel hasChanges={false} onImport={(payload) => onSetup(payload)} onCancel={() => setMode('choose')} />
      </div>
    )
  }

  if (mode === 'flat' || mode === 'trace') {
    return (
      <form
        style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, fontSize: 13 }}
        onSubmit={(event) => {
          event.preventDefault()
          onSetup({ reference: { name: name.trim(), zeroMeaning: zero.trim() }, ...(mode === 'trace' ? { startTool: 'contour-pen' } : {}) })
        }}
      >
        <strong>{mode === 'trace' ? 'Trace contours' : 'Start flat'}: name the height reference</strong>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Reference name
          <input aria-label="Reference name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Main gate road" style={textInput} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          0 m means
          <input aria-label="0 m means" value={zero} onChange={(event) => setZero(event.target.value)} placeholder="e.g. The road at the main gate" style={textInput} />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" style={withDisabled(primaryButton, !name.trim() || !zero.trim())} disabled={!name.trim() || !zero.trim()}>Create terrain</button>
          <button type="button" style={secondaryButton} onClick={() => setMode('choose')}>Back</button>
        </div>
      </form>
    )
  }

  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <strong style={{ fontSize: 15 }}>This campus has no terrain yet</strong>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <button type="button" aria-label="Import ground" style={card} onClick={() => setMode('import')}>
          <strong>Import ground</strong>
          <div style={{ fontSize: 12, marginTop: 6 }}>From a TopoExport .glb, or contour lines (GeoJSON). Heights become metres above sea level.</div>
        </button>
        <button type="button" aria-label="Trace contours" style={card} onClick={() => setMode('trace')}>
          <strong>Trace contours</strong>
          <div style={{ fontSize: 12, marginTop: 6 }}>Draw height lines over a tracing image, then generate the surface.</div>
        </button>
        <button type="button" aria-label="Start flat" style={card} onClick={() => setMode('flat')}>
          <strong>Start flat</strong>
          <div style={{ fontSize: 12, marginTop: 6 }}>Begin at 0 m everywhere and shape the ground with brushes.</div>
        </button>
      </div>
    </div>
  )
}
