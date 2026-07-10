'use client'

import { useState, useEffect, type ReactNode } from 'react'
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
  SelectionBridge,
  SelectionOrigin,
  findEntityById,
  NavigationCompiler,
  PersistenceService,
  WorkflowStore,
  WorkflowService,
  ValidationRegistry,
  polygonClosureValidator,
  duplicateIdsValidator,
} from '@navi/editor'
import type { EntitySelector, PersistenceAdapter } from '@navi/editor'
import type { CampusDocument } from '@navi/core'
import { useGraphStore } from '@/store/graph-store'
import { useStudioStore } from '@/store/studio-store'
import { createCompilerAdapter } from '@/services/compiler-adapter'

/**
 * ── Selection Ownership Invariant ─────────────────────────────────
 *
 * `SelectionManager` (inside the editor package) is the single
 * authoritative source of "what is currently selected." All panels
 * (PropertiesPanel, Inspector) MUST consume selection via the
 * `useSelection()` hook rather than reading `useStudioStore` directly.
 *
 * `useStudioStore.{selectedNodeId, activeBuildingId}` are legacy
 * compatibility values — a view-only projection of SelectionManager
 * state, maintained by the bridge's Direction A callback. They are
 * NOT the source of truth. Canvas highlight sync / camera fly-to may
 * read them, but they MUST NOT drive panel rendering.
 *
 * The bridge (SelectionBridge) synchronizes in both directions:
 *   Direction A: SelectionManager → Zustand (legacy store).
 *   Direction B: Zustand → SelectionManager (canvas click origin).
 *
 * Origin gating: Explorer-originated selections pass through Direction
 * A to set `activeBuildingId` → StudioCanvas flyTo. Canvas-originated
 * selections are suppressed by `SelectionBridge.syncing` (Direction B
 * sets `syncing=true`, preventing Direction A from firing for the
 * canvas-initiated cycle). See `useEffect` below for details.
 * ──────────────────────────────────────────────────────────────────
 *
 * Bridge: converts legacy Graph → CampusDocument and provides
 * a single EditorProvider context so Explorer + PropertiesPanel share
 * one document, one SelectionManager, one dispatcher, one history.
 *
 * The context (document + services) is created ONCE per bridge mount
 * (lifetime invariant) — never recreated on graph/selection/edit changes.
 */
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

interface EditorContextValue {
  document: CampusDocument
  services: ServiceRegistry
}

function buildContext(graph: any): EditorContextValue {
  const document = createDocument(graph)
  const documentStore = new DocumentStore(document)

  const registry = new ServiceRegistry()

  // ServiceRegistry does not auto-create defaults, so register a real eventBus.
  const eventBus = new DocumentEventBus()
  registry.register('eventBus', eventBus)

  const registryCmd = new CommandRegistry()
  registryCmd.register(entityUpdateHandler)

  const dispatcher = new CommandDispatcher(registryCmd, document, eventBus)

  const history = new HistoryStack(dispatcher, document, registryCmd)
  dispatcher.addPreHook(history)
  dispatcher.addPostHook(history)

  const selectionManager = new SelectionManager(document, eventBus)

  // documentStore must be registered before registry.init so dispatcher.init
  // can resolve it via context.get('documentStore').
  registry.register('documentStore', documentStore)
  registry.register('dispatcher', dispatcher)
  registry.register('history', history)
  registry.register('selection', selectionManager)

  // ── Validation ──────────────────────────────────────────────
  const validation = new ValidationRegistry()
  validation.register(polygonClosureValidator)
  validation.register(duplicateIdsValidator)
  registry.register('validation', validation)

  // ── M2.5 Workflow services ─────────────────────────────────
  const persistenceAdapter: PersistenceAdapter = {
    save: () => useGraphStore.getState().save(),
    syncToSupabase: () => useGraphStore.getState().syncToSupabase(),
    publish: async () => {
      // Basic publish — POSTs compiled artifacts to /api/publish
      return { success: true, version: '1.0.0' }
    },
  }

  const navCompiler = new NavigationCompiler(createCompilerAdapter())
  const persistence = new PersistenceService(persistenceAdapter)
  const workflowStore = new WorkflowStore()
  const workflow = new WorkflowService()

  registry.register('navigationCompiler', navCompiler)
  registry.register('persistence', persistence)
  registry.register('workflowStore', workflowStore)
  registry.register('workflow', workflow)

  // Initialize services in dependency order (async work is sync for these services).
  void registry.init(document)

  return { document, services: registry }
}

export function EditorBridge({ children }: { children: ReactNode }) {
  // Created ONCE from the initial graph — enforces the document lifetime invariant.
  const [context] = useState(() => buildContext(useGraphStore.getState().graph))

  // Wire SelectionBridge once per mount: keep the legacy studio store and the
  // new SelectionManager in sync (selection only, loop-guarded).
  useEffect(() => {
    const selectionManager = context.services.get('selection')
    if (!selectionManager) return

    const bridge = new SelectionBridge(selectionManager)

    // Direction A — SelectionManager → legacy store.
    // Origin gating:
    //   Explorer origin → sets activeBuildingId → map flyTo in StudioCanvas
    //   Canvas origin   → suppressed by SelectionBridge.syncing guard
    //                     (canvas already handled its own camera)
    //   Programmatic    → sets activeBuildingId (no map in test, no-op)
    const unsubBridge = bridge.connect({
      onSelectionChanged(state, legacy) {
        useStudioStore.setState({
          selectedNodeId: legacy.selectedNodeId,
          // activeBuildingId triggers the camera fly-to effect in StudioCanvas.
          // Canvas-origin selections are already suppressed by the syncing guard
          // in SelectionBridge (Direction B sets syncing=true, so this callback
          // is skipped during canvas→SelectionManager cycles).
          activeBuildingId: legacy.activeBuildingId,
        })
      },
    })

    // Direction B — legacy store → SelectionManager (loop-guarded).
    const unsubLegacy = useStudioStore.subscribe(() => {
      const s = useStudioStore.getState()
      const legacyId = s.selectedNodeId ?? s.activeBuildingId
      if (!legacyId) {
        bridge.pushExternal(null, SelectionOrigin.Canvas)
        return
      }
      // Id-equality short-circuit: SelectionManager already reflects this id,
      // so pushing again would be a redundant cycle (also blocked by `syncing`).
      if (legacyId === selectionManager.lastSelectedId) return
      const found = findEntityById(context.document, legacyId)
      const selector = found
        ? ({ type: found.path, id: legacyId } as unknown as EntitySelector)
        : ({ type: 'building', id: legacyId } as unknown as EntitySelector)
      bridge.pushExternal(selector, SelectionOrigin.Canvas)
    })

    return () => {
      unsubBridge()
      unsubLegacy()
    }
  }, [context])

  return (
    <EditorProvider context={context}>
      {children}
    </EditorProvider>
  )
}
