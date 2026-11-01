'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useEditor } from '@navi/editor'
import { useGraphStore } from '@/store/graph-store'
import { isSaveV2Enabled } from '@/studio-v2/client/flag'
import { currentStudioSession, type StudioSession, type StudioSessionState } from '@/studio-v2/client/studio-session'
import { saveExplicitly } from '@/studio-v2/client/persistence-adapter'

const IDLE: StudioSessionState = { status: 'clean', message: null, headCommit: 0, dirty: false }

/** The Save v2 session of the open campus, or null with the flag off. */
export function useStudioSession(): StudioSession | null {
  const campusId = useGraphStore((state) => state.currentMapId)
  return isSaveV2Enabled() ? currentStudioSession(campusId) : null
}

export function useStudioSessionState(session: StudioSession | null): StudioSessionState {
  return useSyncExternalStore(
    (onChange) => (session ? session.subscribe(onChange) : () => {}),
    () => (session ? session.getState() : IDLE),
    () => IDLE,
  )
}

/** The explicit Save (button and Ctrl+S): the one action that sends parts to the server. */
export function useExplicitSave(session: StudioSession | null): () => Promise<void> {
  const { services } = useEditor()
  return useCallback(async () => {
    if (!session) return
    const workflow = services.get('workflow') as { save(reason: 'manual'): Promise<void> } | undefined
    await saveExplicitly(session, workflow)
  }, [session, services])
}

/** Ctrl+S / Cmd+S runs the explicit Save while Studio is open. */
export function useSaveShortcut(save: (() => Promise<void>) | null): void {
  useEffect(() => {
    if (!save) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's' || event.shiftKey || event.altKey) return
      event.preventDefault()
      void save().catch(() => undefined)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save])
}
