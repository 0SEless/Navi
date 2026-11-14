'use client'
import { useState } from 'react'
import { GLASS_TYPES, OPENING_MATERIALS, OPENING_MATERIAL_COLORS, WINDOW_PRESETS, resolveWindowStyle, type Opening } from '@navi/core'
import { OpeningThumbnail } from './OpeningThumbnail'
type OpeningPatch = Partial<Pick<Opening, 'width' | 'height' | 'sillHeight' | 'offset' | 'windowAppearance' | 'windowPose' | 'doorAppearance' | 'doorPose' | 'assetPreset' | 'material' | 'glass'>>
const fields = [['width', 'width'], ['height', 'height'], ['sillHeight', 'sill height'], ['offset', 'distance from wall start']] as const
const displayNumber = (value: number) => String(Number(value.toFixed(4)))
export function OpeningProperties({ opening, wallHeight, disabled = false, onUpdate }: {
  opening: Opening; wallHeight: number; disabled?: boolean
  onUpdate(patch: OpeningPatch): { success: boolean; error?: string }
}) {
  const effective = { width: opening.width, height: opening.height ?? (opening.type === 'window' ? 1.2 : 2.1), sillHeight: opening.sillHeight ?? (opening.type === 'window' ? 0.9 : 0), offset: opening.offset }
  const initial = { width: displayNumber(effective.width), height: displayNumber(effective.height), sillHeight: displayNumber(effective.sillHeight), offset: displayNumber(effective.offset) }
  const [values, setValues] = useState(initial)
  const [doorAppearance, setDoorAppearance] = useState(opening.doorAppearance ?? 'solid')
  const [doorPose, setDoorPose] = useState(opening.doorPose ?? 'closed')
  const [error, setError] = useState<string | null>(null)
  const label = opening.type === 'window' ? 'Window' : 'Opening'
  const windowStyle = resolveWindowStyle(opening)
  // Look controls apply at once (visual only); dimensions still use the Apply button below.
  const applyLook = (patch: OpeningPatch) => {
    if (disabled) return
    try { const result = onUpdate(patch); setError(result.success ? null : result.error || 'The window could not be updated.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The window could not be updated.') }
  }
  return <form aria-label="Opening properties" style={{ padding: 12, fontSize: 12, borderTop: '1px solid var(--navi-border)' }} onSubmit={event => {
    event.preventDefault(); if (disabled) return
    const patch: OpeningPatch = {}
    const next = { ...effective }
    for (const [key] of fields) {
      // An untouched rounded display must never replace exact authored geometry.
      if (values[key] === initial[key]) continue
      next[key] = values[key].trim() === '' ? NaN : Number(values[key])
      if (next[key] !== effective[key]) patch[key] = next[key]
    }
    if (opening.type === 'door' && doorAppearance !== (opening.doorAppearance ?? 'solid')) patch.doorAppearance = doorAppearance
    if (opening.type === 'door' && doorPose !== (opening.doorPose ?? 'closed')) patch.doorPose = doorPose
    if (!Object.values(next).every(Number.isFinite) || next.width < 0.2 || next.height <= 0 || next.sillHeight < 0 || next.offset < 0 || next.height + next.sillHeight > wallHeight + 1e-8) { setError('The opening must have valid dimensions and fit inside its wall.'); return }
    if (Object.keys(patch).length === 0) { setError(null); return }
    try { const result = onUpdate(patch); setError(result.success ? null : result.error || 'The opening could not be updated.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The opening could not be updated.') }
  }}>
    <strong>{label}</strong>
    {fields.map(([key, text]) => <label key={key} style={{ display: 'block', marginTop: 10 }}>{key === 'offset' ? 'Wall X - distance from wall start' : key === 'sillHeight' ? 'Floor Z - sill height' : `${label} ${text}`} (m)
      <input aria-label={`${label} ${text} (m)`} type="number" min="0" step="any" value={values[key]} disabled={disabled} onChange={event => setValues(previous => ({ ...previous, [key]: event.target.value }))} style={{ width: '100%', boxSizing: 'border-box', minHeight: 36, background: 'var(--navi-content)', color: 'var(--navi-text)', border: '1px solid var(--navi-border)', borderRadius: 4, padding: 6 }} />
    </label>)}
    <label style={{ display: 'block', marginTop: 10 }}>Wall Y - fixed normal offset (m)
      <input aria-label="Wall Y (m)" type="number" value="0" readOnly disabled={disabled} style={{ width: '100%', minHeight: 36, boxSizing: 'border-box' }} />
    </label>
    <p style={{ fontSize: 10 }}>Distance follows the host wall from its start. Sill height is measured above the active floor; the opening stays centered on its wall.</p>
    {opening.type === 'window' && <div style={{ marginTop: 10 }}>
      <strong>Appearance</strong>
      <div role="group" aria-label="Window style" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(64px,1fr))', gap: 6, marginTop: 8 }}>
        {WINDOW_PRESETS.map(preset => {
          const pressed = opening.assetPreset === preset.id || (opening.assetPreset === undefined && preset.type === windowStyle.type)
          return <button key={preset.id} type="button" aria-label={'Use ' + preset.label} aria-pressed={pressed} title={preset.label} disabled={disabled} onClick={() => applyLook({ assetPreset: preset.id, ...(opening.windowPose !== undefined && !['casement', 'awning', 'jalousie'].includes(preset.type) ? { windowPose: undefined } : {}) })}
            style={{ padding: 2, border: pressed ? '2px solid var(--navi-primary, #2563eb)' : '1px solid var(--navi-border)', borderRadius: 4, background: 'var(--navi-content)', color: 'var(--navi-text)' }}>
            <OpeningThumbnail preset={preset} size={56} />
            <span style={{ display: 'block', fontSize: 10, lineHeight: 1.2 }}>{preset.label}</span>
          </button>
        })}
      </div>
      <div role="group" aria-label="Window material" style={{ marginTop: 10 }}>Frame material
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>{OPENING_MATERIALS.map(material => <button key={material} type="button" aria-label={'Material ' + material} aria-pressed={windowStyle.material === material} disabled={disabled}
          onClick={() => applyLook({ material })} style={{ width: 32, height: 32, borderRadius: 16, background: OPENING_MATERIAL_COLORS[material], border: windowStyle.material === material ? '3px solid var(--navi-primary, #2563eb)' : '1px solid var(--navi-border)' }} />)}</div>
      </div>
      {windowStyle.type !== 'open' && windowStyle.type !== 'vent-block' && <label style={{ display: 'block', marginTop: 10 }}>Glass
        <select aria-label="Window glass" value={windowStyle.glass} disabled={disabled} onChange={event => applyLook({ glass: event.target.value as NonNullable<Opening['glass']> })} style={{ width: '100%', minHeight: 36 }}>
          {GLASS_TYPES.map(glass => <option key={glass} value={glass}>{glass[0].toUpperCase() + glass.slice(1)}</option>)}
        </select>
      </label>}
      {(windowStyle.type === 'casement' || windowStyle.type === 'awning' || windowStyle.type === 'jalousie') && <label style={{ display: 'block', marginTop: 10 }}>Position
        <select aria-label="Window position" value={windowStyle.pose} disabled={disabled} onChange={event => applyLook({ windowPose: event.target.value as NonNullable<Opening['windowPose']> })} style={{ width: '100%', minHeight: 36 }}>
          <option value="closed">Closed</option><option value="open">Open</option>
        </select>
      </label>}
    </div>}
    {error && <p role="alert" style={{ color: '#DC2626' }}>{error}</p>}
    {opening.type === 'door' && <label style={{ display: 'block', marginTop: 10 }}>Door appearance
      <select aria-label="Door appearance" value={doorAppearance} disabled={disabled} onChange={event => setDoorAppearance(event.target.value as NonNullable<Opening['doorAppearance']>)} style={{width:'100%',minHeight:36}}>
        <option value="solid">Solid panel</option><option value="glass">Glass panel</option><option value="double-solid">Double solid panels</option><option value="double-glass">Double glass panels</option><option value="open">Open frame</option>
      </select>
    </label>}
    {opening.type === 'door' && <label style={{display:'block',marginTop:10}}>Door position
      <select aria-label="Door position" value={doorPose} disabled={disabled||doorAppearance==='open'} onChange={event=>setDoorPose(event.target.value as NonNullable<Opening['doorPose']>)} style={{width:'100%',minHeight:36}}>
        <option value="closed">Closed</option><option value="ajar">Ajar (30 degrees)</option><option value="open">Open (90 degrees)</option>
      </select>
    </label>}
    <button type="submit" disabled={disabled} style={{ minHeight: 44, marginTop: 12, width: '100%' }}>Apply opening changes</button>
    <p style={{ fontSize: 10 }}>Applies to the working draft. Campus Save is separate.</p>
  </form>
}
