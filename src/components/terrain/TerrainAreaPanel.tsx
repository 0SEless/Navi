'use client'

import { useState } from 'react'
import type { TerrainTool } from './TerrainToolRail'

type LatLng = { lat: number; lng: number }

export interface TracedLine { elevationM: number; points: LatLng[] }

const box: React.CSSProperties = {
  position: 'absolute', right: 12, top: 12, zIndex: 2, width: 240, display: 'flex', flexDirection: 'column', gap: 8, padding: 10, fontSize: 12,
  background: 'var(--navi-card, #fff)', border: '1px solid var(--navi-border, #e5e7eb)', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
}
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }

/**
 * Settings and Apply for the click tools: Lasso (set / raise by / lower by), Slope (two points with
 * heights and a width), Reset (lasso), Contour pen (lines with a height, then Generate surface).
 */
export function TerrainAreaPanel(props: {
  tool: Extract<TerrainTool, 'lasso' | 'slope' | 'reset' | 'contour-pen'>
  points: LatLng[]
  groundAt: (p: LatLng) => number | null
  traced: TracedLine[]
  onClear: () => void
  onLasso: (op: { kind: 'set' | 'raise-by' | 'lower-by'; meters: number }) => void
  onSlope: (fromH: number, toH: number, widthM: number) => void
  onReset: () => void
  onAddLine: (elevationM: number) => void
  onGenerate: () => void
}) {
  const { tool, points } = props
  const [kind, setKind] = useState<'set' | 'raise-by' | 'lower-by'>('set')
  const [meters, setMeters] = useState(1)
  const [width, setWidth] = useState(4)
  const [fromH, setFromH] = useState<string>('')
  const [toH, setToH] = useState<string>('')
  const [lineHeight, setLineHeight] = useState(5)
  const picked = (p: LatLng | undefined) => (p ? props.groundAt(p) : null)

  if (tool === 'lasso' || tool === 'reset') {
    const ready = points.length >= 3
    return (
      <div aria-label={tool === 'lasso' ? 'Lasso settings' : 'Reset settings'} style={box}>
        <strong>{tool === 'lasso' ? 'Lasso' : 'Reset'}</strong>
        <span style={{ color: 'var(--navi-text-secondary, #6b7280)' }}>Click around the area ({points.length} points).</span>
        {tool === 'lasso' && (
          <>
            <label style={row}>
              Do
              <select aria-label="Lasso action" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                <option value="set">Set height to</option>
                <option value="raise-by">Raise by</option>
                <option value="lower-by">Lower by</option>
              </select>
            </label>
            <label style={row}>
              Metres
              <input aria-label="Lasso metres" type="number" step={0.1} style={{ width: 70 }} value={meters} onChange={(event) => setMeters(Number(event.target.value))} />
            </label>
          </>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" disabled={!ready} onClick={() => (tool === 'lasso' ? props.onLasso({ kind, meters }) : props.onReset())}>Apply</button>
          <button type="button" onClick={props.onClear}>Clear</button>
        </div>
      </div>
    )
  }

  if (tool === 'slope') {
    const fromDefault = picked(points[0])
    const toDefault = picked(points[1])
    const from = fromH === '' ? fromDefault : Number(fromH)
    const to = toH === '' ? toDefault : Number(toH)
    return (
      <div aria-label="Slope settings" style={box}>
        <strong>Slope</strong>
        <span style={{ color: 'var(--navi-text-secondary, #6b7280)' }}>Click the start, then the end.</span>
        <label style={row}>
          Start (m)
          <input aria-label="Slope start height" type="number" step={0.1} style={{ width: 70 }} placeholder={fromDefault?.toFixed(2) ?? ''} value={fromH} onChange={(event) => setFromH(event.target.value)} />
        </label>
        <label style={row}>
          End (m)
          <input aria-label="Slope end height" type="number" step={0.1} style={{ width: 70 }} placeholder={toDefault?.toFixed(2) ?? ''} value={toH} onChange={(event) => setToH(event.target.value)} />
        </label>
        <label style={row}>
          Width (m)
          <input aria-label="Slope width" type="number" min={1} max={60} style={{ width: 70 }} value={width} onChange={(event) => setWidth(Number(event.target.value))} />
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" disabled={points.length < 2 || from === null || to === null} onClick={() => props.onSlope(from!, to!, width)}>Apply</button>
          <button type="button" onClick={() => { setFromH(''); setToH(''); props.onClear() }}>Clear</button>
        </div>
      </div>
    )
  }

  return (
    <div aria-label="Contour pen settings" style={box}>
      <strong>Contour pen</strong>
      <span style={{ color: 'var(--navi-text-secondary, #6b7280)' }}>Click along a height line, give its height, Add line. {props.traced.length} line(s) so far.</span>
      <label style={row}>
        Height (m)
        <input aria-label="Contour height" type="number" step={0.5} style={{ width: 70 }} value={lineHeight} onChange={(event) => setLineHeight(Number(event.target.value))} />
      </label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" disabled={points.length < 2} onClick={() => props.onAddLine(lineHeight)}>Add line</button>
        <button type="button" onClick={props.onClear}>Clear</button>
        <button type="button" disabled={props.traced.length === 0} onClick={props.onGenerate}>Generate surface</button>
      </div>
    </div>
  )
}
