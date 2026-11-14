'use client'

import { useState } from 'react'
import type { Wall } from '@navi/core'

export interface WallPropertiesProps {
  wall: Wall
  floorHeight: number
  disabled?: boolean
  onUpdate(patch: { height: number; thickness: number }): { success: boolean; error?: string }
}

/** Key this form by wall identity/dimensions so Undo also resets pending inputs. */
export function WallProperties({ wall, floorHeight, disabled = false, onUpdate }: WallPropertiesProps) {
  const [height, setHeight] = useState(String(wall.height))
  const [thickness, setThickness] = useState(String(wall.thickness))
  const [error, setError] = useState<string | null>(null)
  const inputStyle = { width: '100%', boxSizing: 'border-box' as const, minHeight: 36, padding: '6px', borderRadius: 4, border: '1px solid var(--navi-border)', background: 'var(--navi-content)', color: 'var(--navi-text)' }
  return <form aria-label="Wall properties" style={{ padding: 12, fontSize: 12, color: 'var(--navi-text)', borderTop: '1px solid var(--navi-border)' }} onSubmit={event => {
    event.preventDefault()
    if (disabled) return
    const patch = { height: Number(height), thickness: Number(thickness) }
    if (![patch.height, patch.thickness].every(value => Number.isFinite(value) && value > 0)) { setError('Height and thickness must be positive finite numbers.'); return }
    try {
      const result = onUpdate(patch)
      setError(result.success ? null : result.error || 'The wall could not be updated.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The wall could not be updated.') }
  }}>
    <strong>Wall</strong>
    <p style={{ color: 'var(--navi-text-secondary)' }}>Length {Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y).toFixed(2)} m</p>
    <label style={{ display: 'block', marginBottom: 10 }}>Wall height (m)<input aria-label="Wall height (m)" type="number" min="0.01" step="any" value={height} disabled={disabled} onChange={event => setHeight(event.target.value)} style={inputStyle} /></label>
    <button type="button" disabled={disabled || !Number.isFinite(floorHeight) || floorHeight <= 0} onClick={() => setHeight(String(floorHeight))} style={{ minHeight: 36, marginBottom: 12 }}>Use floor height</button>
    <label style={{ display: 'block', marginBottom: 10 }}>Wall thickness (m)<input aria-label="Wall thickness (m)" type="number" min="0.01" step="0.01" value={thickness} disabled={disabled} onChange={event => setThickness(event.target.value)} style={inputStyle} /></label>
    {error && <p role="alert" style={{ color: '#DC2626' }}>{error}</p>}
    <button type="submit" disabled={disabled} style={{ minHeight: 44, width: '100%' }}>Apply wall changes</button>
    <p style={{ color: 'var(--navi-text-secondary)', fontSize: 10 }}>Applies to the working draft. Campus Save is separate.</p>
  </form>
}
