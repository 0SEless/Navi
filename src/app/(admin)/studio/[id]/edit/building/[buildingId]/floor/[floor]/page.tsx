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

  const persistenceAdapter: PersistenceAdapter = {
    save: async () => {
      const ctx = contextRef.current
      if (ctx) {
        const ga = new GraphAdapter(useGraphStore.getState().graph, ctx.transformer)
        ga.sync(ctx.document)
      }
      await useGraphStore.getState().save()
    },
    syncToSupabase: async () => {
      const ctx = contextRef.current
      if (ctx) {
        const ga = new GraphAdapter(useGraphStore.getState().graph, ctx.transformer)
        ga.sync(ctx.document)
      }
      await useGraphStore.getState().syncToSupabase()
    },
    publish: async () => ({ success: true, version: '1.0.0' }),
  }
  const navCompiler = new NavigationCompiler(createCompilerAdapter())
  const [context] = useState(() => {
    const ctx = createEditorContext(
      useGraphStore.getState().graph,
      persistenceAdapter,
      navCompiler,
    )
    return ctx
  })
  contextRef.current = context

  return (
    <ErrorBoundary>
      <EditorProvider context={context}>
        <FloorEditor mapId={mapId} buildingId={buildingId} floor={floor} />
      </EditorProvider>
    </ErrorBoundary>
  )
}
