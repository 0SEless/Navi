'use client'

import { useState } from 'react'
import { Palette } from 'lucide-react'
import { TERRAIN_LOOKS, terrainLookStyle, type TerrainLook } from '@navi/core'

/**
 * The visitor's ground look on this device. Choosing the campus default clears the visitor's choice
 * (onChange(null)), so a later change by the campus owner shows again.
 */
export function TerrainLookSwitch({ active, campusDefault, onChange }: {
  active: TerrainLook
  campusDefault: TerrainLook
  onChange: (look: TerrainLook | null) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Map look"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Map look"
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--navi-border)] bg-[var(--navi-card)] text-[var(--navi-text)] shadow-md"
      >
        <Palette className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label="Map look" className="absolute right-12 top-0 w-56 rounded-xl border border-[var(--navi-border)] bg-[var(--navi-card)] p-1 text-sm text-[var(--navi-text)] shadow-lg">
          {TERRAIN_LOOKS.map((look) => {
            const style = terrainLookStyle(look)
            const label = look === campusDefault ? `${style.label} (campus default)` : style.label
            const swatch = style.heightColors ? `linear-gradient(90deg, ${style.heightColors.join(', ')})` : style.ground
            return (
              <button
                key={look}
                type="button"
                role="menuitemradio"
                aria-checked={look === active}
                aria-label={label}
                onClick={() => { setOpen(false); onChange(look === campusDefault ? null : look) }}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${look === active ? 'font-semibold' : ''}`}
              >
                <span aria-hidden="true" className="h-4 w-6 shrink-0 rounded border border-[var(--navi-border)]" style={{ background: swatch }} />
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
