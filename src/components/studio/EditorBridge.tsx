'use client'

import { useState, type ReactNode } from 'react'
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
} from '@navi/editor'
import type { CampusDocument } from '@navi/core'
import { useGraphStore } from '@/store/graph-store'

/**
 * Minimal bridge: converts legacy Graph → CampusDocument and provides
 * a single EditorProvider context so Explorer + PropertiesPanel share one
 * document, one SelectionManager, one dispatcher, one history.
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

  // Initialize services in dependency order (async work is sync for these services).
  void registry.init(document)

  return { document, services: registry }
}

export function EditorBridge({ children }: { children: ReactNode }) {
  // Created ONCE from the initial graph — enforces the document lifetime invariant.
  const [context] = useState(() => buildContext(useGraphStore.getState().graph))

  return (
    <EditorProvider context={context}>
      {children}
    </EditorProvider>
  )
}
