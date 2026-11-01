'use client'

import { useEffect } from 'react'
import { useEditor } from '@navi/editor'
import type { CurrentToolStore } from '@navi/editor'
import { useEnsureZone } from './ZoneProvider'

/** The campus boundary tool edits the strictly-locked `campus` zone (spec §7.1). */
export function CampusToolZoneGuard({ toolId = 'boundary' }: { toolId?: string }) {
  const { services } = useEditor()
  const ensureZone = useEnsureZone()
  useEffect(() => {
    const store = services.get('toolRegistry') as CurrentToolStore | undefined
    if (!store) return
    const check = () => {
      if (store.activeToolId !== toolId) return
      void ensureZone(['campus']).then((granted) => {
        if (!granted && store.activeToolId === toolId) store.deactivate()
      })
    }
    check()
    return store.subscribe(check)
  }, [services, ensureZone, toolId])
  return null
}
