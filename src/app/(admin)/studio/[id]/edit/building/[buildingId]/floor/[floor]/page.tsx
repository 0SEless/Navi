'use client'

import { useEffect, use, useState, useRef } from 'react'
import { FloorEditor } from '@/components/floor-editor/FloorEditor'
import { ErrorBoundary } from '@/components/floor-editor/ErrorBoundary'
import {
  EditorProvider,
  NavigationCompiler,
  createEditorContext,
  GraphAdapter,
} from '@navi/editor'
import type { PersistenceAdapter, EditorContext } from '@navi/editor'
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
  const contextRef = useRef<EditorContext | null>(null)

  const syncDocumentAndCapture = () => {
    const ctx = contextRef.current
    if (!ctx) return
    const state = useGraphStore.getState()
    const ga = new GraphAdapter(state.graph, ctx.transformer)
    ga.sync(ctx.document)
    const nextState = useGraphStore.getState()
    if (nextState.authoredDocument !== null || ctx.document.version > 0) {
      nextState.setAuthoredDocument(ctx.document)
    }
  }

  const persistenceAdapter: PersistenceAdapter = {
    save: async () => {
      syncDocumentAndCapture()
      await useGraphStore.getState().save()
    },
    syncToSupabase: async () => {
      syncDocumentAndCapture()
      await useGraphStore.getState().syncToSupabase()
    },
    publish: async () => ({ success: true, version: '1.0.0' }),
  }
  const navCompiler = new NavigationCompiler(createCompilerAdapter())
  const [context] = useState(() => {
    const state = useGraphStore.getState()
    const authoredDocument = state.authoredDocument
    const ctx = createEditorContext(
      state.graph,
      persistenceAdapter,
      navCompiler,
      authoredDocument && authoredDocument.metadata.campusId === mapId
        ? authoredDocument
        : undefined,
    )
    return ctx
  })
  contextRef.current = context

  // Route transitions and tab exits can unmount the editor without giving the
  // normal command autosave debounce a chance to run. Phase 3B: the committed
  // LOCAL draft is made durable here — no server synchronization from teardown.
  useEffect(() => {
    const flushLocalPersistence = () => {
      syncDocumentAndCapture()
      useGraphStore.getState().persistLocalDraft()
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
  }, [])

  return (
    <ErrorBoundary>
      <EditorProvider context={context}>
        <FloorEditor mapId={mapId} buildingId={buildingId} floor={floor} />
      </EditorProvider>
    </ErrorBoundary>
  )
}
