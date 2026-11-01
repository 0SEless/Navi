'use client'

import { useEffect, use, useMemo, useRef, useState } from 'react'
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
import { isStudioLocalDraftModeEnabled } from '@/store/graph-store'
import { StudioLocalDraftRecoveryGate } from '@/components/studio/EditorBridge'
import { StudioScopedHistoryBridge } from '@/components/studio/StudioScopedHistoryBridge'
import { isStudioDurableScopedSaveEnabled } from '@/services/studio-scoped-history-flag'
import { flushScopedSaveBoundary } from '@/services/scoped-save-boundary'
import { createCompilerAdapter } from '@/services/compiler-adapter'
import { adoptRecoveredEditorDocument } from '@/components/studio/adopt-recovered-editor-document'
import { isSaveV2Enabled } from '@/studio-v2/client/flag'
import { ZoneProvider } from '@/components/studio/v2/ZoneProvider'
import { FloorZoneGate } from '@/components/studio/v2/FloorZoneGate'
import { currentStudioSession, getStudioSession } from '@/studio-v2/client/studio-session'
import { createV2PersistenceAdapter } from '@/studio-v2/client/persistence-adapter'
import { adoptV2Document } from '@/studio-v2/client/adopt-v2-document'

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

  const editor = (
    <StudioLocalDraftRecoveryGate>
      <FloorEditorBridge mapId={mapId} buildingId={buildingId} floor={floor} />
    </StudioLocalDraftRecoveryGate>
  )
  if (!isSaveV2Enabled()) return editor
  // Save v2: the floor editor opens the building, so it needs the building lock first.
  return (
    <ZoneProvider campusId={mapId} showDenials={false}>
      <FloorZoneGate buildingId={buildingId}>{editor}</FloorZoneGate>
    </ZoneProvider>
  )
}

function FloorEditorBridge({ mapId, buildingId, floor }: { mapId: string; buildingId: string; floor: number }) {
  const adoptionVersion = useGraphStore((state) => state.serverAdoptionVersion)
  return (
    <FloorEditorBridgeSession
      key={`${mapId}-${buildingId}-${floor}-${adoptionVersion}`}
      mapId={mapId}
      buildingId={buildingId}
      floor={floor}
      adoptionVersion={adoptionVersion}
    />
  )
}

function FloorEditorBridgeSession({
  mapId,
  buildingId,
  floor,
  adoptionVersion,
}: {
  mapId: string
  buildingId: string
  floor: number
  adoptionVersion: number
}) {
  // Stable identity so effects can list it as a dependency without re-running
  // on every render.
  const floorScope = useMemo(
    () => ({ kind: 'floor', buildingId, floor }),
    [buildingId, floor],
  )

  // Save v2: the floor editor shares the campus session (baseline, drafts, locks) with the map.
  const [v2Session] = useState(() => (isSaveV2Enabled() ? currentStudioSession(mapId) ?? getStudioSession(mapId) : null))

  const [context] = useState(() => {
    let currentCtx: EditorContext | null = null

    const syncDocumentAndCapture = () => {
      if (!currentCtx) return
      const state = useGraphStore.getState()
      if (state.serverAdoptionVersion !== adoptionVersion) {
        throw new Error('This editor context was superseded by server adoption.')
      }
      const ga = new GraphAdapter(state.graph, currentCtx.transformer)
      ga.sync(currentCtx.document, floorScope)
      const nextState = useGraphStore.getState()
      nextState.setAuthoredDocument(currentCtx.document)
    }

    const persistenceAdapter: PersistenceAdapter = {
      save: async (reason = 'manual') => {
        syncDocumentAndCapture()
        useGraphStore.getState().recordAuthoredMutation('floor', buildingId, floor)
        const trigger = isStudioLocalDraftModeEnabled() ? reason : 'manual'
        if (isStudioDurableScopedSaveEnabled()) {
          await useGraphStore.getState().save({ trigger: 'manual', localOnly: true })
          await flushScopedSaveBoundary(currentCtx!.document)
        } else {
          await useGraphStore.getState().save({ trigger })
        }
      },
      syncToSupabase: async () => {
        syncDocumentAndCapture()
        useGraphStore.getState().recordAuthoredMutation('floor', buildingId, floor)
        if (isStudioDurableScopedSaveEnabled()) {
          await useGraphStore.getState().save({ trigger: 'manual', localOnly: true })
          await flushScopedSaveBoundary(currentCtx!.document)
        } else if (isStudioLocalDraftModeEnabled()) await useGraphStore.getState().save({ trigger: 'manual' })
        else await useGraphStore.getState().syncToSupabase({ trigger: 'manual' })
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
      v2Session ? createV2PersistenceAdapter(v2Session) : persistenceAdapter,
      navCompiler,
    )
    adoptRecoveredEditorDocument(currentCtx, useGraphStore.getState())
    adoptV2Document(currentCtx, useGraphStore.getState())
    return currentCtx
  })

  useEffect(() => (v2Session ? v2Session.attach(context) : undefined), [v2Session, context])

  // Destroy autosave timers and other services when this context is replaced.
  // The microtask guard tolerates React Strict Mode's setup/cleanup replay.
  const contextLifecycle = useRef(0)
  useEffect(() => {
    contextLifecycle.current += 1
    return () => {
      const cleanupToken = ++contextLifecycle.current
      queueMicrotask(() => {
        if (contextLifecycle.current === cleanupToken) {
          void context.services.destroy().catch((error: unknown) => {
            console.warn('Editor context cleanup failed:', error)
          })
        }
      })
    }
  }, [context])

  // Initial reconciliation on mount: ensure the graph projection is synchronized
  // and mark the campus ready so floor-scoped saves are permitted by the safety guard.
  useEffect(() => {
    const graph = useGraphStore.getState().graph
    if (typeof graph?.setBuildings !== 'function') return
    new GraphAdapter(graph, context.transformer).sync(context.document, floorScope)
    useGraphStore.getState().setAuthoredDocument(context.document)
    useGraphStore.setState((state) => ({ renderVersion: state.renderVersion + 1 }))
    useGraphStore.getState().completeCampusHydration()
  }, [context, floorScope])

  // Continuous projection: keep graph and authoredDocument in lockstep as the user edits.
  useEffect(() => {
    const eventBus = context.services.get('eventBus') as DocumentEventBus | undefined
    if (!eventBus) return

    const unsubscribe = eventBus.on('document.changed', () => {
      if (useGraphStore.getState().serverAdoptionVersion !== adoptionVersion) return
      const graph = useGraphStore.getState().graph
      new GraphAdapter(graph, context.transformer).sync(context.document, floorScope)
      useGraphStore.getState().setAuthoredDocument(context.document)
      useGraphStore.getState().recordAuthoredMutation('floor', buildingId, floor)
      useGraphStore.setState((state) => ({ renderVersion: state.renderVersion + 1 }))
      v2Session?.refresh(context.document)
    })

    return () => unsubscribe()
  }, [context, floorScope, buildingId, floor, adoptionVersion, v2Session])

  // Route transitions and tab exits can unmount the editor without giving the
  // normal command autosave debounce a chance to run. Reuse the existing
  // GraphAdapter/local graph-store path for a synchronous best-effort flush.
  useEffect(() => {
    if (v2Session) {
      // Save v2 (spec §6.2): leaving or hiding the floor editor writes the local draft only.
      const writeDraft = () => {
        void v2Session.writeDraft(context.document)
      }
      const handleV2Visibility = () => {
        if (document.visibilityState === 'hidden') writeDraft()
      }
      const handleV2BeforeUnload = (event: BeforeUnloadEvent) => {
        writeDraft()
        if (!v2Session.isDirty(context.document)) return
        event.preventDefault()
        event.returnValue = ''
      }
      window.addEventListener('beforeunload', handleV2BeforeUnload)
      document.addEventListener('visibilitychange', handleV2Visibility)
      return () => {
        window.removeEventListener('beforeunload', handleV2BeforeUnload)
        document.removeEventListener('visibilitychange', handleV2Visibility)
        // The map page adopts this document on return (authoredDocument is kept in lockstep).
        writeDraft()
      }
    }
    const flushLocalPersistence = () => {
      const state = useGraphStore.getState()
      if (state.serverAdoptionVersion !== adoptionVersion) return
      const workflow = context.services.get('workflow') as { isDirty?: () => boolean } | undefined
      const isDirty = typeof workflow?.isDirty === 'function' ? workflow.isDirty() : false
      if (!isDirty && state.pendingAuthoredMutations.length === 0) {
        return
      }
      const ga = new GraphAdapter(state.graph, context.transformer)
      ga.sync(context.document, floorScope)
      const nextState = useGraphStore.getState()
      nextState.setAuthoredDocument(context.document)
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
  }, [buildingId, floor, context, floorScope, adoptionVersion, v2Session])

  return (
    <ErrorBoundary>
      <EditorProvider context={context}>
        <StudioScopedHistoryBridge context={context} campusId={mapId} />
        <FloorEditor mapId={mapId} buildingId={buildingId} floor={floor} />
      </EditorProvider>
    </ErrorBoundary>
  )
}
