'use client'

import { useState } from 'react'
import { effectiveBuildingBase, groundAroundOf, type BankSlope, type Building, type GroundAround, type GroundFit, type TerrainSampler } from '@navi/core'

const box: React.CSSProperties = {
  position: 'absolute', right: 12, top: 12, zIndex: 2, width: 250, display: 'flex', flexDirection: 'column', gap: 8, padding: 10, fontSize: 12,
  background: 'var(--navi-card, #fff)', border: '1px solid var(--navi-border, #e5e7eb)', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
}
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }

export interface GroundChange { baseMode: 'follow-ground' | 'fixed'; baseElevation?: number; pad?: GroundFit; around?: GroundAround; bankSlope?: BankSlope }

/** One building on the terrain: Follow ground or Fixed (typed / nudged), Snap to ground, the pad, Cut away above. */
export function BuildingGroundPanel({ building, sampler, cutAboveFloorId, onChange, onCutAbove }: {
  building: Building | null
  sampler: TerrainSampler | null
  cutAboveFloorId: string | null
  onChange: (change: GroundChange) => void
  onCutAbove: (floorId: string | null) => void
}) {
  const [typed, setTyped] = useState('')
  if (!building) {
    return <div aria-label="Building settings" style={box}><strong>Buildings</strong><span>Click a building on the map.</span></div>
  }
  const mode = building.ground?.baseMode ?? 'fixed'
  const pad = building.ground?.pad ?? { mode: 'off' as const, blendMeters: 3 }
  const { around } = groundAroundOf(building)
  const bankSlope: BankSlope = building.ground?.bankSlope ?? 'normal'
  const base = sampler ? effectiveBuildingBase(building, sampler) : building.baseElevation
  const fixedAt = (value: number) => onChange({ baseMode: 'fixed', baseElevation: Math.round(value * 100) / 100, pad })
  const floors = [...building.floors].sort((a, b) => a.elevation - b.elevation)

  return (
    <div aria-label="Building settings" style={box}>
      <strong>{building.name}</strong>
      <span>Base height: {base.toFixed(2)} m</span>
      <label style={{ display: 'flex', gap: 6 }}>
        <input type="radio" name="base-mode" checked={mode === 'follow-ground'} onChange={() => onChange({ baseMode: 'follow-ground', pad })} />
        Follow the ground
      </label>
      <label style={{ display: 'flex', gap: 6 }}>
        <input type="radio" name="base-mode" checked={mode === 'fixed'} onChange={() => fixedAt(base)} />
        Fixed height
      </label>
      {mode === 'fixed' && (
        <div style={row}>
          <input aria-label="Fixed base height" type="number" step={0.1} style={{ width: 70 }} placeholder={base.toFixed(2)} value={typed} onChange={(event) => setTyped(event.target.value)} />
          <button type="button" disabled={typed === ''} onClick={() => { fixedAt(Number(typed)); setTyped('') }}>Set</button>
          <button type="button" aria-label="Lower 0.5 m" onClick={() => fixedAt(base - 0.5)}>▼</button>
          <button type="button" aria-label="Raise 0.5 m" onClick={() => fixedAt(base + 0.5)}>▲</button>
        </div>
      )}
      {mode === 'fixed' && <button type="button" onClick={() => onChange({ baseMode: 'follow-ground', pad })}>Snap to ground</button>}
      {/* Banks and plinths (owner 2026-11-15): how the hill meets this building. */}
      <label style={row}>
        Ground around
        <select aria-label="Ground around" value={around} onChange={(event) => onChange({ baseMode: mode, around: event.target.value as GroundAround })}>
          <option value="bank">Bank and plinth</option>
          <option value="slopes">Slopes all round</option>
          <option value="leave">Leave the hill as it is</option>
        </select>
      </label>
      {around !== 'leave' && (
        <label style={row}>
          Bank slope
          <select aria-label="Bank slope" value={bankSlope} onChange={(event) => onChange({ baseMode: mode, bankSlope: event.target.value as BankSlope })}>
            <option value="gentle">Gentle (1 in 3)</option>
            <option value="normal">Normal (1 in 2)</option>
            <option value="steep">Steep (1 in 1)</option>
          </select>
        </label>
      )}
      {floors.length > 1 && (
        <label style={row}>
          Cut away above
          <select aria-label="Cut away above" value={cutAboveFloorId ?? ''} onChange={(event) => onCutAbove(event.target.value || null)}>
            <option value="">Show all floors</option>
            {floors.slice(0, -1).map((floor) => <option key={floor.id} value={floor.id}>{floor.label}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}
