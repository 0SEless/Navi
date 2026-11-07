'use client'

import { useEffect, useRef } from 'react'
import type { BrushSettings } from '@navi/core'
import { TERRAIN_TOOLS, type TerrainTool } from './TerrainToolRail'

interface History { undo(): boolean; redo(): boolean }

const TOOL_BY_KEY = new Map(TERRAIN_TOOLS.map((entry) => [entry.key, entry.id]))
const NOT_TYPING = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'])

/** True while the user types into a field (keys belong to the field); a checkbox or button is not typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  if (el.tagName === 'INPUT') return !NOT_TYPING.has((el as HTMLInputElement).type)
  return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

/**
 * One key per tool (section 4: V Move, B Raise/Lower, S Smooth, F Flatten, P Slope, L Lasso, U Buildings,
 * T Stairs, H Height picker, R Reset, C Contour pen, E Edit boundary), [ ] brush size (Shift ±5 m),
 * Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) undo and redo. Ctrl+S is the save shortcut, Shift+Z height mode.
 * Tool keys are ignored in fields, with a modifier held and in height mode; editing tools need the
 * terrain lock (Move always, Stairs whenever there is ground).
 */
export function useTerrainShortcuts(opts: {
  enabled: boolean
  heightMode?: boolean
  stairsAvailable?: boolean
  history: History | undefined
  setTool: (tool: TerrainTool) => void
  setSettings: (update: (current: BrushSettings) => BrushSettings) => void
}): void {
  const latest = useRef(opts)
  useEffect(() => {
    latest.current = opts
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      const { enabled, heightMode, stairsAvailable, history, setTool, setSettings } = latest.current
      const key = event.key.toLowerCase()
      if (event.ctrlKey || event.metaKey) {
        if (!enabled || !history) return
        if (key === 'z' && !event.shiftKey) {
          event.preventDefault()
          history.undo()
        } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
          event.preventDefault()
          history.redo()
        }
        return
      }
      if (event.altKey) return
      if (event.key === '[' || event.key === ']' || event.key === '{' || event.key === '}') {
        const step = event.shiftKey ? 5 : 1
        const sign = event.key === '[' || event.key === '{' ? -1 : 1
        setSettings((current) => ({ ...current, sizeM: Math.min(60, Math.max(1, current.sizeM + sign * step)) }))
        return
      }
      if (event.shiftKey || heightMode) return
      const tool = TOOL_BY_KEY.get(key)
      if (!tool) return
      if (tool === 'pan' || (tool === 'stairs' ? stairsAvailable !== false : enabled)) setTool(tool)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
