'use client'

import { useEffect, use, useState } from 'react'
import { FloorEditor } from '@/components/floor-editor/FloorEditor'
import { ErrorBoundary } from '@/components/floor-editor/ErrorBoundary'
import { DebugConsoleCapture } from '@/components/floor-editor/DebugConsoleCapture'
import { configureFloorEditorTools } from '@/components/floor-editor/configure-floor-editor-tools'
import {
  EditorProvider,
  ServiceRegistry,
  SelectionManager,
  DocumentStore,
  DocumentEventBus,
  CommandRegistry,
  CommandDispatcher,
  HistoryStack,
  entityUpdateHandler,
  NavigationCompiler,
  PersistenceService,
  WorkflowStore,
  WorkflowService,
  EditingContextService,
  ValidationRegistry,
  polygonClosureValidator,
  duplicateIdsValidator,
  ToolRegistry,
  Viewport,
} from '@navi/editor'
import type { PersistenceAdapter } from '@navi/editor'
import type { CampusDocument } from '@navi/core'
import { useGraphStore } from '@/store/graph-store'
import { createCompilerAdapter } from '@/services/compiler-adapter'

function createDocument(graph: any): CampusDocument {
  return {
    schemaVersion: 1,
    metadata: {
      name: graph.name ?? 'Campus',
      description: '',
      lastModified: new Date().toISOString(),
      editorVersion: '1.0.0',
    },
    buildings: (graph.buildings ?? []).map((b: any) => ({
      id: b.id,
      name: b.name ?? b.id,
      code: b.code ?? '',
      category: 'academic',
      description: '',
      floors: (b.floors ?? []).map((f: any) => ({
        id: f.id ?? `flr-${f.level}`,
        level: f.level,
        label: `${f.level}`,
        elevation: 0,
        rooms: (f.rooms ?? []).map((r: any) => ({ id: r.id, name: r.name ?? r.id, number: r.number ?? '', category: 'classroom', polygon: { points: [] }, capacity: 0, metadata: {} })),
        hallways: (f.hallways ?? []).map((h: any) => ({ id: h.id, name: h.name ?? h.id, polyline: { points: [] }, width: 2 })),
        staircases: (f.staircases ?? []).map((s: any) => ({ id: s.id, name: s.name ?? s.id, position: { x: 0, y: 0 }, fromLevel: f.level, toLevel: f.level + 1, type: 'straight' })),
        elevators: (f.elevators ?? []).map((e: any) => ({ id: e.id, name: e.name ?? e.id, position: { x: 0, y: 0 }, fromLevel: f.level, toLevel: f.level + 1 })),
        entrances: (f.entrances ?? []).map((e: any) => ({ id: e.id, label: e.name ?? e.id, position: { lat: 0, lng: 0 }, level: f.level, type: 'main', hasQR: false, hasPanorama: false })),
        metadata: {},
      })),
      footprint: { points: (b.footprint?.points ?? []).map((p: any) => ({ lat: p.lat, lng: p.lng })) },
      baseElevation: 0,
      height: 10,
      color: b.color ?? '#1C6BEB',
      aliases: [],
      metadata: {},
    })),
    roads: [],
    panoramas: [],
    qrCheckpoints: [],
  }
}

export default function FloorEditorPage({ params }: { params: Promise<{ id: string; buildingId: string; floor: string }> }) {
  const { id: mapId, buildingId, floor: floorStr } = use(params)
  const floor = parseInt(floorStr, 10)
  const loadMapData = useGraphStore((s) => s.loadMapData)

  useEffect(() => {
    loadMapData(mapId)
  }, [mapId, loadMapData])

  const [context] = useState(() => {
    const graph = useGraphStore.getState().graph
    const document = createDocument(graph)
    const documentStore = new DocumentStore(document)
    const registry = new ServiceRegistry()
    const eventBus = new DocumentEventBus()
    registry.register('eventBus', eventBus)

    const registryCmd = new CommandRegistry()
    registryCmd.register(entityUpdateHandler)
    const dispatcher = new CommandDispatcher(registryCmd, document, eventBus)
    const history = new HistoryStack(dispatcher, document, registryCmd)
    dispatcher.addPreHook(history)
    dispatcher.addPostHook(history)

    const selectionManager = new SelectionManager(document, eventBus)
    registry.register('documentStore', documentStore)
    registry.register('dispatcher', dispatcher)
    registry.register('history', history)
    registry.register('selection', selectionManager)

    const toolRegistry = new ToolRegistry()
    const viewport = new Viewport(eventBus)
    registry.register('toolRegistry', toolRegistry)
    registry.register('viewport', viewport)

    const validation = new ValidationRegistry()
    validation.register(polygonClosureValidator)
    validation.register(duplicateIdsValidator)
    registry.register('validation', validation)

    const persistenceAdapter: PersistenceAdapter = {
      save: () => useGraphStore.getState().save(),
      syncToSupabase: () => useGraphStore.getState().syncToSupabase(),
      publish: async () => ({ success: true, version: '1.0.0' }),
    }
    const navCompiler = new NavigationCompiler(createCompilerAdapter())
    const persistence = new PersistenceService(persistenceAdapter)
    const workflowStore = new WorkflowStore()
    const workflow = new WorkflowService()
    const editingContext = new EditingContextService()

    registry.register('navigationCompiler', navCompiler)
    registry.register('persistence', persistence)
    registry.register('workflowStore', workflowStore)
    registry.register('workflow', workflow)
    registry.register('editingContext', editingContext)

    void registry.init(document)

    configureFloorEditorTools(toolRegistry)

    return { document, services: registry }
  })

  return (
    <ErrorBoundary>
      <EditorProvider context={context}>
        <FloorEditor mapId={mapId} buildingId={buildingId} floor={floor} />
      </EditorProvider>
    </ErrorBoundary>
  )
}
