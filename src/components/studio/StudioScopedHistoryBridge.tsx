'use client'

import { useEffect, useRef } from 'react'
import type { DocumentEventBus, EditorContext } from '@navi/editor'
import { GraphAdapter } from '@navi/editor'
import { createScopedHistoryDevClient } from '@/services/scoped-history-dev-client'
import { isStudioScopedHistoryEnabled } from '@/services/studio-scoped-history-flag'
import { isStudioDurableScopedSaveEnabled } from '@/services/studio-scoped-history-flag'
import { createScopedSaveDocumentSession } from '@/services/scoped-save-document-session'
import { deriveScopedDocumentChanges } from '@/services/scoped-change-detection'
import { registerScopedSaveBoundary } from '@/services/scoped-save-boundary'
import { isStudioLocalDraftModeEnabled, useGraphStore } from '@/store/graph-store'

/** Optional local-only observer shared by Studio editor contexts. */
export function StudioScopedHistoryBridge({
  context,
  campusId,
}: {
  context: EditorContext
  campusId: string
}) {
  const clientRef = useRef<ReturnType<typeof createScopedHistoryDevClient> | null>(null)
  const generationRef = useRef(0)

  useEffect(() => {
    const generation = ++generationRef.current
    if (isStudioDurableScopedSaveEnabled()) {
      clientRef.current = null
      if (!isStudioLocalDraftModeEnabled() || typeof indexedDB === 'undefined' || !campusId || context.document.metadata?.campusId !== campusId) {
        useGraphStore.getState().setScopedHistoryStatus('error', 'Durable local saving requires a matching campus document and recoverable IndexedDB drafts.')
        return
      }
      const session = createScopedSaveDocumentSession({
        campusId,
        enabled: isStudioDurableScopedSaveEnabled,
        onStateChange: (state) => useGraphStore.getState().setScopedHistoryStatus(state.status, state.detail),
      })
      const unregister = registerScopedSaveBoundary((document) => session.save(document))
      void session.initialize(context.document).then(async (restoredDocument) => {
        if (JSON.stringify(context.document) !== JSON.stringify(restoredDocument)) {
          const localChanges = deriveScopedDocumentChanges(restoredDocument, context.document, campusId)
          if (localChanges.status === 'unchanged') {
            useGraphStore.getState().setScopedHistoryStatus('local-draft', 'IndexedDB draft recovery is active; durable saves target the local synthetic E5 database only.')
            return
          }
          const localDraftStatus = useGraphStore.getState().localDraftStatus
          if (localDraftStatus !== 'idle') {
            const detail = 'The recovered local draft differs from the current synthetic E5 revision. The local draft is preserved for review.'
            useGraphStore.setState({ localDraftStatus: 'conflict', localDraftError: detail, syncStatus: 'conflict', syncError: detail })
            useGraphStore.getState().setScopedHistoryStatus('conflict', detail)
            return
          }
          const documentStore = context.services.get('documentStore')
          const workflowStore = context.services.get('workflowStore')
          if (!documentStore || !workflowStore) throw new Error('Editor document services are unavailable for server snapshot recovery.')
          documentStore.adoptSnapshot(restoredDocument)
          workflowStore.setLastSaveVersion(documentStore.version)
          const graph = useGraphStore.getState().graph
          new GraphAdapter(graph, context.transformer).sync(context.document)
          useGraphStore.getState().setAuthoredDocument(context.document)
          useGraphStore.setState((state) => ({ renderVersion: state.renderVersion + 1 }))
          await useGraphStore.getState().save({ trigger: 'autosave' })
        }
        useGraphStore.getState().setScopedHistoryStatus('local-draft', 'IndexedDB draft recovery is active; durable saves target the local synthetic E5 database only.')
      }).catch((error: unknown) => {
        useGraphStore.getState().setScopedHistoryStatus('error', error instanceof Error ? error.message : 'Local E5 scoped save session could not be initialized.')
      })
      return () => {
        generationRef.current += 1
        unregister()
      }
    }
    if (!isStudioScopedHistoryEnabled()) {
      clientRef.current = null
      useGraphStore.getState().setScopedHistoryStatus('disabled', null)
      return
    }
    if (!isStudioLocalDraftModeEnabled() || typeof indexedDB === 'undefined') {
      clientRef.current = null
      useGraphStore.getState().setScopedHistoryStatus(
        'error',
        'Scoped history requires the Development IndexedDB draft feature and browser IndexedDB. Editor changes remain available to the existing save path.',
      )
      return
    }
    if (!campusId || context.document.metadata?.campusId !== campusId) {
      clientRef.current = null
      useGraphStore.getState().setScopedHistoryStatus('rejected', 'The active campus identity does not match the editor document.')
      return
    }

    const client = createScopedHistoryDevClient({
      enabled: isStudioScopedHistoryEnabled,
      coalesceMs: 400,
      onStateChange: (state) => useGraphStore.getState().setScopedHistoryStatus(state.status, state.detail),
    })
    clientRef.current = client
    queueMicrotask(() => {
      if (generationRef.current !== generation || clientRef.current !== client) return
      void client.start(context.document, campusId).catch((error: unknown) => {
        useGraphStore.getState().setScopedHistoryStatus('error', error instanceof Error ? error.message : 'Scoped history could not be initialized.')
      })
    })
    return () => {
      generationRef.current += 1
      client.dispose()
      if (clientRef.current === client) clientRef.current = null
    }
  }, [context, campusId])

  useEffect(() => {
    const eventBus = context.services.get('eventBus') as DocumentEventBus | undefined
    if (!eventBus) return

    return eventBus.on('document.changed', () => {
      if (!isStudioScopedHistoryEnabled() || isStudioDurableScopedSaveEnabled()) return
      void clientRef.current?.recordDocument(context.document).catch((error: unknown) => {
        useGraphStore.getState().setScopedHistoryStatus('error', error instanceof Error ? error.message : 'Local scoped validation failed.')
      })
    })
  }, [context])

  return null
}
