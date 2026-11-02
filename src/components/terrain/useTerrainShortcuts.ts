'use client'

import { useEffect, useRef } from 'react'
import type { BrushSettings } from '@navi/core'
import type { TerrainTool } from './TerrainToolRail'

interface History { undo(): boolean; redo(): boolean }

/** B brush, [ ] size (Shift ±5 m), Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) undo and redo. Ctrl+S is the save shortcut. */
export function useTerrainShortcuts(opts: {
  enabled: boolean
  history: History | undefined
  setTool: (tool: TerrainTool) => void
  setSettings: (update: (current: BrushSettings) => BrushSettings) => void
}): void {
  const latest = useRef(opts)
  latest.current = opts

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const { enabled, history, setTool, setSettings } = latest.current
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
      if (key === 'b' && enabled) setTool('raise-lower')
      else if (event.key === '[' || event.key === ']' || event.key === '{' || event.key === '}') {
        const step = event.shiftKey ? 5 : 1
        const sign = event.key === '[' || event.key === '{' ? -1 : 1
        setSettings((current) => ({ ...current, sizeM: Math.min(60, Math.max(1, current.sizeM + sign * step)) }))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
