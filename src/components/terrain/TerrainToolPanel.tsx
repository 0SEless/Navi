'use client'

import type { BrushSettings } from '@navi/core'
import { MAP_CENTRE_X } from './form-styles'

export const DEFAULT_BRUSH: BrushSettings = { shape: 'circle', rotationDeg: 0, sizeM: 10, aspect: 0.5, profile: 'smooth', strength: 0.5, mode: 'raise' }

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12 }

/** Brush settings: shape and rotation, profile, mode, size 1–60 m, strength 1–100 %, target height. */
export function TerrainToolPanel({ settings, onChange, showMode }: { settings: BrushSettings; onChange: (next: BrushSettings) => void; showMode: boolean }) {
  const set = (patch: Partial<BrushSettings>) => onChange({ ...settings, ...patch })
  return (
    <div aria-label="Brush settings" style={{
      position: 'absolute', left: MAP_CENTRE_X, bottom: 64, transform: 'translateX(-50%)', zIndex: 2, width: 230, display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
      background: 'var(--navi-card, #fff)', border: '1px solid var(--navi-border, #e5e7eb)', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    }}>
      <strong style={{ fontSize: 12 }}>Brush</strong>
      <label style={row}>
        Shape
        <select aria-label="Brush shape" value={settings.shape} onChange={(event) => set({ shape: event.target.value as BrushSettings['shape'] })}>
          <option value="circle">Circle</option>
          <option value="oval">Oval</option>
          <option value="rectangle">Rectangle</option>
          <option value="triangle">Triangle</option>
        </select>
      </label>
      {settings.shape !== 'circle' && (
        <label style={row}>
          Rotation {settings.rotationDeg}°
          <input aria-label="Brush rotation" type="range" min={0} max={359} value={settings.rotationDeg} onChange={(event) => set({ rotationDeg: Number(event.target.value) })} />
        </label>
      )}
      {(settings.shape === 'oval' || settings.shape === 'rectangle') && (
        <label style={row}>
          Width {Math.round(settings.aspect * 100)}%
          <input aria-label="Brush width" type="range" min={10} max={100} value={Math.round(settings.aspect * 100)} onChange={(event) => set({ aspect: Number(event.target.value) / 100 })} />
        </label>
      )}
      <label style={row}>
        Profile
        <select aria-label="Brush profile" value={settings.profile} onChange={(event) => set({ profile: event.target.value as BrushSettings['profile'] })}>
          <option value="flat">Flat top</option>
          <option value="smooth">Smooth</option>
          <option value="linear">Linear</option>
          <option value="hard">Hard</option>
        </select>
      </label>
      {showMode && (
        <label style={row}>
          Mode
          <select aria-label="Brush mode" value={settings.mode} onChange={(event) => set({ mode: event.target.value as BrushSettings['mode'] })}>
            <option value="raise">Raise only</option>
            <option value="lower">Lower only</option>
            <option value="set">Set to height</option>
          </select>
        </label>
      )}
      {showMode && settings.mode === 'set' && (
        <label style={row}>
          Target (m)
          <input aria-label="Target height" type="number" step={0.1} style={{ width: 70 }} value={settings.targetM ?? ''} onChange={(event) => set({ targetM: event.target.value === '' ? undefined : Number(event.target.value) })} />
        </label>
      )}
      <label style={row}>
        Size {settings.sizeM} m
        <input aria-label="Brush size" type="range" min={1} max={60} value={settings.sizeM} onChange={(event) => set({ sizeM: Number(event.target.value) })} />
      </label>
      <label style={row}>
        Strength {Math.round(settings.strength * 100)}%
        <input aria-label="Brush strength" type="range" min={1} max={100} value={Math.round(settings.strength * 100)} onChange={(event) => set({ strength: Number(event.target.value) / 100 })} />
      </label>
      <span style={{ fontSize: 11, color: 'var(--navi-text-secondary, #6b7280)' }}>[ ] size · Shift opposite · Alt+click picks a height</span>
    </div>
  )
}
