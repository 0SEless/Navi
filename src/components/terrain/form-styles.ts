import type { CSSProperties } from 'react'

/** Button looks for the terrain set-up screens (the app's base styles remove the browser's button look). */
const base: CSSProperties = {
  padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', lineHeight: 1.2,
}

export const primaryButton: CSSProperties = {
  ...base, background: 'var(--navi-primary, #2563eb)', color: '#fff', border: '1px solid var(--navi-primary, #2563eb)',
}

export const secondaryButton: CSSProperties = {
  ...base, background: 'var(--navi-card, #fff)', color: 'var(--navi-text, #111827)', border: '1px solid var(--navi-border, #d1d5db)',
}

/** Disabled buttons fade out and show the "not allowed" cursor. */
export function withDisabled(style: CSSProperties, disabled: boolean): CSSProperties {
  return disabled ? { ...style, opacity: 0.45, cursor: 'not-allowed' } : style
}

export const textInput: CSSProperties = {
  padding: '7px 10px', borderRadius: 6, fontSize: 13, border: '1px solid var(--navi-border, #d1d5db)', background: 'var(--navi-card, #fff)',
}

/** Section 5: the layers panel's width; the map's visible centre is right of it. */
export const LAYERS_PANEL_WIDTH = 240
export const MAP_CENTRE_X = `calc(50% + ${LAYERS_PANEL_WIDTH / 2}px)`

