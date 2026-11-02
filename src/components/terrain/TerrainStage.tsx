'use client'

import { useState } from 'react'
import type maplibregl from 'maplibre-gl'
import type { CampusDocument, TerrainSampler } from '@navi/core'
import type { TerrainView } from '@/lib/terrain/terrain-view'
import { TerrainMap } from './TerrainMap'

const MINI: React.CSSProperties = {
  position: 'absolute', right: 12, bottom: 12, width: 320, height: 220, borderRadius: 8, overflow: 'hidden',
  border: '1px solid var(--navi-border, #d1d5db)', boxShadow: '0 4px 14px rgba(0,0,0,0.18)', background: '#fff',
}
const MINI_BUTTON: React.CSSProperties = { padding: '2px 8px', fontSize: 11, borderRadius: 4, border: '1px solid #d1d5db', background: 'rgba(255,255,255,0.92)', cursor: 'pointer' }

/**
 * The main view (top view by default) plus the live mini 3D window. Swap makes 3D the main view;
 * Pop out opens the 3D view in its own window. `popOut` renders the 3D view alone (that window).
 */
export function TerrainStage({ document, sampler, version, view, exaggeration, popOut, onMainMap, onMiniMap, layers }: {
  document: CampusDocument
  sampler: TerrainSampler | null
  version: number
  view: TerrainView
  exaggeration: number
  popOut: boolean
  onMainMap?: (map: maplibregl.Map | null) => void
  onMiniMap?: (map: maplibregl.Map | null) => void
  layers?: { buildings: boolean; roads: boolean; contours: boolean }
}) {
  const [large, setLarge] = useState<'top' | '3d'>(popOut ? '3d' : 'top')
  const common = { document, sampler, version, view, exaggeration, layers }

  if (popOut) return <TerrainMap key="popout" {...common} pitch={60} onMap={onMainMap} />

  return (
    <>
      <TerrainMap key={`main-${large}`} {...common} pitch={large === 'top' ? 0 : 60} onMap={onMainMap} />
      <div style={MINI} data-terrain-mini="true">
        <TerrainMap key={`mini-${large}`} {...common} pitch={large === 'top' ? 60 : 0} onMap={onMiniMap} />
        <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
          <button type="button" style={MINI_BUTTON} onClick={() => setLarge((value) => (value === 'top' ? '3d' : 'top'))}>Swap</button>
          <button
            type="button"
            style={MINI_BUTTON}
            onClick={() => window.open(`${window.location.pathname}?view=3d`, 'navi-terrain-3d', 'width=960,height=720')}
          >
            Pop out
          </button>
        </div>
      </div>
    </>
  )
}
