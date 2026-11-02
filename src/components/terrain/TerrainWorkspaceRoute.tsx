'use client'

import { useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useDocumentVersion, useEditor, type Command, type MutationResult } from '@navi/editor'
import { isSaveV2Enabled } from '@/studio-v2/client/flag'
import { ZoneProvider } from '@/components/studio/v2/ZoneProvider'
import { useExplicitSave, useSaveShortcut, useStudioSession } from '@/components/studio/v2/useStudioSession'
import { TerrainWorkspace, type SaveResult } from './TerrainWorkspace'
import { useTerrainLock } from './useTerrainLock'

interface Dispatcher {
  execute(command: Command): MutationResult
}

/** Wires the terrain workspace to the editor, the Save v2 session, the terrain lock and navigation. */
export function TerrainWorkspaceRoute({ mapId, children }: { mapId: string; children?: ReactNode }) {
  const { document } = useEditor()
  if (!isSaveV2Enabled()) {
    return <div style={{ padding: 32, fontSize: 13 }}>The terrain workspace needs the new saving (Save v2) turned on.</div>
  }
  return (
    <ZoneProvider campusId={document.metadata.campusId} showDenials={false}>
      <TerrainWorkspaceConnected mapId={mapId}>{children}</TerrainWorkspaceConnected>
    </ZoneProvider>
  )
}

function TerrainWorkspaceConnected({ mapId, children }: { mapId: string; children?: ReactNode }) {
  const { document, services } = useEditor()
  useDocumentVersion() // re-render on every document change
  const router = useRouter()
  const session = useStudioSession()
  const save = useExplicitSave(session)
  useSaveShortcut(save)
  const lock = useTerrainLock()

  const dispatch = useCallback((command: Command): MutationResult | undefined => {
    if (lock.status !== 'held') return { success: false, error: 'The terrain is locked by another admin.' }
    const dispatcher = services.get('dispatcher') as Dispatcher | undefined
    return dispatcher?.execute(command)
  }, [lock.status, services])

  const onSave = useCallback(async (): Promise<SaveResult> => {
    if (!session) return { ok: true }
    await save()
    const state = session.getState()
    if (state.status === 'error' || state.status === 'conflict') return { ok: false, message: state.message ?? 'Could not save the terrain.' }
    return { ok: true }
  }, [save, session])

  return (
    <TerrainWorkspace
      document={document}
      dispatch={dispatch}
      lock={lock}
      onSave={onSave}
      onLeave={() => router.push(`/studio/${encodeURIComponent(mapId)}/edit`)}
    >
      {children}
    </TerrainWorkspace>
  )
}
