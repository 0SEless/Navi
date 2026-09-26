'use client'

import { useEffect, use, useState } from 'react'
import { FloorEditor } from '@/components/floor-editor/FloorEditor'
import { ErrorBoundary } from '@/components/floor-editor/ErrorBoundary'
import {
  EditorProvider,
  NavigationCompiler,
  createEditorContext,
  GraphAdapter,
} from '@navi/editor'
import type { PersistenceAdapter, EditorContext, DocumentEventBus, PersistenceSyncState } from '@navi/editor'
import { useGraphStore } from '@/store/graph-store'
import { createCompilerAdapter } from '@/services/compiler-adapter'

export default function FloorEditorPage({ params }: { params: Promise<{ id: string; buildingId: string; floor: string }> }) {
  const { id: mapId, buildingId, floor: floorStr } = use(params)
  const floor = parseInt(floorStr, 10)
  const loadMapData = useGraphStore((s) => s.loadMapData)
  const currentMapId = useGraphStore((s) => s.currentMapId)

  useEffect(() => {
    if (currentMapId !== mapId) {
      loadMapData(mapId)
    }
  }, [mapId, currentMapId, loadMapData])

  if (currentMapId !== mapId) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>
        Loading map…
      </div>
    )
  }

  return <FloorEditorBridge mapId={mapId} buildingId={buildingId} floor={floor} />
}

function FloorEditorBridge({ mapId, buildingId, floor }: { mapId: string; buildingId: string; floor: number }) {
  const [context] = useState(() => {
    let currentCtx: EditorContext | null = null

    const syncDocumentAndCapture = () => {
      if (!currentCtx) return
      const state = useGraphStore.getState()
      const ga = new GraphAdapter(state.graph, currentCtx.transformer)
      ga.sync(currentCtx.document)
      const nextState = useGraphStore.getState()
      if (nextState.authoredDocument !== null || currentCtx.document.version > 0) {
        nextState.setAuthoredDocument(currentCtx.document)
      }
    }

    const persistenceAdapter: PersistenceAdapter = {
      save: async () => {
        syncDocumentAndCapture()
        useGraphStore.getState().recordAuthoredMutation('floor', buildingId, floor)
        await useGraphStore.getState().save({ trigger: 'autosave' })
      },
      syncToSupabase: async () => {
        syncDocumentAndCapture()
        useGraphStore.getState().recordAuthoredMutation('floor', buildingId, floor)
        await useGraphStore.getState().syncToSupabase({ trigger: 'autosave' })
      },
      publish: async () => ({ success: true, version: '1.0.0' }),
      getSyncState: (): PersistenceSyncState => {
        const state = useGraphStore.getState()
        return { status: state.syncStatus, error: state.syncError }
      },
      subscribeSyncState: (listener) => {
        let previous = {
          status: useGraphStore.getState().syncStatus,
          error: useGraphStore.getState().syncError,
        }
        return useGraphStore.subscribe(() => {
          const state = useGraphStore.getState()
          const next = { status: state.syncStatus, error: state.syncError }
          if (next.status === previous.status && next.error === previous.error) return
          previous = next
          listener(next)
        })
      },
    }

    const navCompiler = new NavigationCompiler(createCompilerAdapter())
    currentCtx = createEditorContext(
      useGraphStore.getState().graph,
      persistenceAdapter,
      navCompiler,
      useGraphStore.getState().authoredDocument ?? undefined,
    )
    return currentCtx
  })

  // Initial reconciliation on mount: ensure the graph projection is synchronized
  // and mark the campus ready so floor-scoped saves are permitted by the safety guard.
  useEffect(() => {
    const graph = useGraphStore.getState().graph
    if (typeof graph?.setBuildings !== 'function') return
    new GraphAdapter(graph, context.transformer).sync(context.document)
    if (useGraphStore.getState().authoredDocument !== null) {
      useGraphStore.getState().setAuthoredDocument(context.document)
    }
    useGraphStore.setState((state) => ({ renderVersion: state.renderVersion + 1 }))
    useGraphStore.getState().completeCampusHydration()
  }, [context])

  // Continuous projection: keep graph and authoredDocument in lockstep as the user edits.
  useEffect(() => {
    const eventBus = context.services.get('eventBus') as DocumentEventBus | undefined
    if (!eventBus) return

    const unsubscribe = eventBus.on('document.changed', () => {
      const graph = useGraphStore.getState().graph
      new GraphAdapter(graph, context.transformer).sync(context.document)
      useGraphStore.getState().setAuthoredDocument(context.document)
      useGraphStore.setState((state) => ({ renderVersion: state.renderVersion + 1 }))
    })

    return () => unsubscribe()
  }, [context])

  // Route transitions and tab exits can unmount the editor without giving the
  // normal command autosave debounce a chance to run. Reuse the existing
  // GraphAdapter/local graph-store path for a synchronous best-effort flush.
  useEffect(() => {
    const flushLocalPersistence = () => {
      const state = useGraphStore.getState()
      const ga = new GraphAdapter(state.graph, context.transformer)
      ga.sync(context.document)
      const nextState = useGraphStore.getState()
      if (nextState.authoredDocument !== null || context.document.version > 0) {
        nextState.setAuthoredDocument(context.document)
      }
      useGraphStore.getState().recordAuthoredMutation('floor', buildingId, floor)
      void useGraphStore.getState().save({ trigger: 'autosave' }).catch((error: unknown) => {
        console.warn('Floor editor exit persistence failed:', error)
      })
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushLocalPersistence()
    }
    window.addEventListener('beforeunload', flushLocalPersistence)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', flushLocalPersistence)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      flushLocalPersistence()
    }
  }, [buildingId, floor, context])

  return (
    <ErrorBoundary>
      <EditorProvider context={context}>
        <FloorEditor mapId={mapId} buildingId={buildingId} floor={floor} />
      </EditorProvider>
    </ErrorBoundary>
  )
}
