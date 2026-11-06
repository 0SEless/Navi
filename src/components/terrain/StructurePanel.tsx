'use client'

import { useState } from 'react'
import {
  BUILT_IN_MATERIALS, BUILT_IN_PRESETS,
  type CampusDocument, type ResolvedStructure, type Structure, type StructurePreset,
} from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'
import { presetFor } from '@/lib/terrain/structure-mesh'
import { addLanding, rampReadout, stairReadout, withoutEndHeight } from '@/lib/terrain/structure-edit'

const box: React.CSSProperties = {
  position: 'absolute', right: 12, top: 12, zIndex: 2, width: 260, display: 'flex', flexDirection: 'column', gap: 8, padding: 10, fontSize: 12,
  background: 'var(--navi-card, #fff)', border: '1px solid var(--navi-border, #e5e7eb)', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
}
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }
const PARTS = [['tread', 'Treads'], ['side', 'Sides'], ['under', 'Underside'], ['railing', 'Railing']] as const
const RAILING_STYLES: Array<[StructurePreset['look']['railingStyle'], string]> = [
  ['posts-rails', 'Posts and rails'], ['bars', 'Vertical bars'], ['glass', 'Glass panels'], ['wall', 'Solid low wall'],
]

function newId(prefix: string): string {
  return `${prefix}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`
}

/** A number field that changes the stair once, when you leave it or press Enter. */
function MetresField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (value: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return
    const next = Number(text)
    setText(null)
    if (Number.isFinite(next) && next >= min && next <= max && next !== value) onCommit(next)
  }
  return (
    <label style={row}>
      {label}
      <input
        aria-label={label} type="number" step={0.1} min={min} max={max} style={{ width: 70 }}
        value={text ?? String(value)}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') commit() }}
      />
    </label>
  )
}

/** Settings of the selected stair: preset (Swap keeps the ends), shape, look, readout, Save as preset, Delete. */
export function StructurePanel({ document, structure, resolved, dispatch, onDeleted }: {
  document: CampusDocument
  structure: Structure | null
  resolved: ResolvedStructure | null
  dispatch: (command: Command) => MutationResult | undefined
  onDeleted: () => void
}) {
  const [saving, setSaving] = useState<{ name: string; look: StructurePreset['look'] } | null>(null)
  if (!structure) {
    return (
      <div aria-label="Stair settings" style={box}>
        <strong>Stairs</strong>
        <span>Click the map to place a stair. Drag its top end onto a floor edge and the other end onto a road or the ground.</span>
      </div>
    )
  }
  const preset = presetFor(document, structure.presetId)
  const presets = [...(document.structurePresets ?? []), ...BUILT_IN_PRESETS.filter((p) => !document.structurePresets?.some((own) => own.id === p.id))]
  const replace = (next: Structure, label = 'Edit stair') => dispatch({ id: 'structure.replace', label, payload: { structure: next } })
  const readout = resolved ? stairReadout(structure, resolved) : null
  const ramp = resolved ? rampReadout(structure, resolved) : null
  const rise = resolved ? resolved.end.h - resolved.start.h : 0
  const orphans = [resolved?.orphanStart ? 'start' : null, resolved?.orphanEnd ? 'end' : null].filter(Boolean)

  /** A Shift+Z offset on a ground/road end: how far above/below its surface, and Back to ground. */
  const offsetRow = (which: 'start' | 'end') => {
    const offset = structure.heightOffset?.[which]
    const end = structure[which]
    if (offset === undefined || end.kind === 'slab') return null
    const name = which === 'start' ? 'Start' : 'End'
    const surface = end.kind === 'road' ? 'road' : 'ground'
    return (
      <div style={row}>
        <span>{offset >= 0 ? `${name} +${offset.toFixed(1)} m above the ${surface}` : `${name} ${Math.abs(offset).toFixed(1)} m below the ${surface}`}</span>
        <button type="button" onClick={() => replace(withoutEndHeight(structure, which), 'Back to ground')}>Back to ground</button>
      </div>
    )
  }

  const floorPicker = (which: 'start' | 'end') => {
    const end = structure[which]
    if (end.kind !== 'slab') return null
    const building = document.buildings.find((b) => b.id === end.buildingId)
    if (!building) return null
    return (
      <label style={row}>
        {which === 'start' ? 'Start floor' : 'End floor'}
        <select aria-label={which === 'start' ? 'Start floor' : 'End floor'} value={end.floorId} onChange={(event) => replace({ ...structure, [which]: { ...end, floorId: event.target.value } })}>
          {[...building.floors].sort((a, b) => a.elevation - b.elevation).map((floor) => <option key={floor.id} value={floor.id}>{floor.label}</option>)}
        </select>
      </label>
    )
  }

  const savePreset = () => {
    if (!saving || saving.name.trim() === '') return
    const created: StructurePreset = {
      id: newId('preset'), name: saving.name.trim(), form: structure.form,
      shape: { width: structure.width, underneath: structure.underneath, railings: structure.railings },
      look: saving.look,
    }
    const result = dispatch({ id: 'structure-preset.create', label: 'Save as preset', payload: { preset: created } })
    if (result?.success !== false) dispatch({ id: 'structure.swap-preset', label: 'Use new preset', payload: { id: structure.id, preset: created } })
    setSaving(null)
  }

  return (
    <div aria-label="Stair settings" style={box}>
      <strong>{structure.form === 'stairs' ? 'Stair' : 'Ramp'}</strong>
      {orphans.length > 0 && (
        <div role="status" style={{ padding: 6, borderRadius: 4, background: '#fee2e2', color: '#991b1b' }}>
          The building or floor for the {orphans.join(' and ')} was removed. It keeps its last height; drag it onto a floor edge again.
        </div>
      )}
      <label style={row}>
        Preset
        <select aria-label="Preset" value={preset.id} onChange={(event) => {
          const next = presets.find((p) => p.id === event.target.value)
          if (next) dispatch({ id: 'structure.swap-preset', label: 'Swap preset', payload: { id: structure.id, preset: next } })
        }}>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <MetresField label="Width (m)" value={structure.width} min={0.6} max={10} onCommit={(width) => replace({ ...structure, width })} />
      <label style={row}>
        Underneath
        <select aria-label="Underneath" value={structure.underneath} onChange={(event) => replace({ ...structure, underneath: event.target.value as Structure['underneath'] })}>
          <option value="open">Open (sloped slab)</option>
          <option value="solid">Solid (down to the ground)</option>
        </select>
      </label>
      <label style={row}>
        Railings
        <select aria-label="Railings" value={structure.railings} onChange={(event) => replace({ ...structure, railings: event.target.value as Structure['railings'] })}>
          <option value="both">Both sides</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="none">None</option>
        </select>
      </label>
      {floorPicker('start')}
      {floorPicker('end')}
      {offsetRow('start')}
      {offsetRow('end')}
      <span style={{ color: 'var(--navi-muted, #6b7280)' }}>
        Look: {PARTS.map(([part, name]) => `${name.toLowerCase()} ${BUILT_IN_MATERIALS[preset.look[part]]?.name.toLowerCase() ?? preset.look[part]}`).join(', ')}
      </span>
      {readout && (
        <div aria-label="Stair readout" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span>{readout.steps} steps · riser {Math.abs(readout.riserM).toFixed(3)} m · tread {readout.treadM.toFixed(2)} m</span>
          <span>Flight {(readout.flightEndM - readout.flightStartM).toFixed(1)} m of {readout.length.toFixed(1)} m · rise {rise.toFixed(2)} m</span>
          {readout.hint && <span style={{ color: '#b45309' }}>{readout.hint}</span>}
        </div>
      )}
      {ramp && resolved && (
        <div aria-label="Ramp readout" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>{ramp.slopeRatio === null ? 'Level' : `Slope 1:${ramp.slopeRatio.toFixed(1)}`} · rise {rise.toFixed(2)} m</span>
          <span>Runs {ramp.runsBetweenLandingsM.map((r) => `${r.toFixed(1)} m`).join(', ')}</span>
          {(structure.landings ?? []).map((t, index) => (
            <div key={index} style={row}>
              <span>Landing {index + 1} at {(t * ramp.length).toFixed(1)} m</span>
              <button type="button" aria-label={`Remove landing ${index + 1}`} onClick={() => replace({ ...structure, landings: (structure.landings ?? []).filter((_, i) => i !== index) }, 'Remove landing')}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => replace({ ...structure, landings: addLanding(structure, resolved) }, 'Add landing')}>Add landing</button>
        </div>
      )}
      {saving ? (
        <div aria-label="Save as preset" style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6, borderTop: '1px solid var(--navi-border, #e5e7eb)' }}>
          <input aria-label="Preset name" placeholder="Preset name" value={saving.name} onChange={(event) => setSaving({ ...saving, name: event.target.value })} />
          {PARTS.map(([part, name]) => (
            <label key={part} style={row}>
              {name}
              <select aria-label={`${name} material`} value={saving.look[part]} onChange={(event) => setSaving({ ...saving, look: { ...saving.look, [part]: event.target.value } })}>
                {Object.values(BUILT_IN_MATERIALS).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          ))}
          <label style={row}>
            Railing style
            <select aria-label="Railing style" value={saving.look.railingStyle} onChange={(event) => setSaving({ ...saving, look: { ...saving.look, railingStyle: event.target.value as StructurePreset['look']['railingStyle'] } })}>
              {RAILING_STYLES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <div style={row}>
            <button type="button" onClick={() => setSaving(null)}>Cancel</button>
            <button type="button" disabled={saving.name.trim() === ''} onClick={savePreset}>Save preset</button>
          </div>
        </div>
      ) : (
        <div style={row}>
          <button type="button" onClick={() => setSaving({ name: `${preset.name} (copy)`, look: { ...preset.look } })}>Save as preset…</button>
          <button type="button" onClick={() => {
            const result = dispatch({ id: 'structure.delete', label: 'Delete stair', payload: { id: structure.id } })
            if (result?.success !== false) onDeleted()
          }}>Delete</button>
        </div>
      )}
    </div>
  )
}
