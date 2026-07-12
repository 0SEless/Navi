'use client'

import { useEffect, use, useState } from 'react'
import { FloorEditor } from '@/components/floor-editor/FloorEditor'
import { ErrorBoundary } from '@/components/floor-editor/ErrorBoundary'
import { configureFloorEditorTools } from '@/components/floor-editor/configure-floor-editor-tools'
import {
  EditorProvider,
  NavigationCompiler,
  createEditorContext,
} from '@navi/editor'
import type { PersistenceAdapter } from '@navi/editor'
import { useGraphStore } from '@/store/graph-store'
import { createCompilerAdapter } from '@/services/compiler-adapter'

export default function FloorEditorPage({ params }: { params: Promise<{ id: string; buildingId: string; floor: string }> }) {
  const { id: mapId, buildingId, floor: floorStr } = use(params)
  const floor = parseInt(floorStr, 10)
  const loadMapData = useGraphStore((s) => s.loadMapData)

  useEffect(() => {
    loadMapData(mapId)
  }, [mapId, loadMapData])

  const persistenceAdapter: PersistenceAdapter = {
    save: () => useGraphStore.getState().save(),
    syncToSupabase: () => useGraphStore.getState().syncToSupabase(),
    publish: async () => ({ success: true, version: '1.0.0' }),
  }
  const navCompiler = new NavigationCompiler(createCompilerAdapter())
  const [context] = useState(() => {
    const ctx = createEditorContext(
      useGraphStore.getState().graph,
      persistenceAdapter,
      navCompiler,
    )
    configureFloorEditorTools(ctx.services.get('toolRegistry'))
    return ctx
  })

  return (
    <ErrorBoundary>
      <EditorProvider context={context}>
        <FloorEditor mapId={mapId} buildingId={buildingId} floor={floor} />
      </EditorProvider>
    </ErrorBoundary>
  )
}
