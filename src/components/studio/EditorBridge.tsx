'use client'

import { useMemo, type ReactNode } from 'react'
import { EditorProvider, ServiceRegistry, SelectionManager } from '@navi/editor'
import type { CampusDocument } from '@navi/core'
import { useGraphStore } from '@/store/graph-store'

/**
 * Minimal bridge: converts legacy Graph → CampusDocument and provides
 * EditorProvider context so Explorer can use SelectionManager.
 *
 * This component will be replaced once CampusDocument is the primary model.
 * Its only job is to create the editor context from legacy data.
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

export function EditorBridge({ children }: { children: ReactNode }) {
  const graph = useGraphStore((s) => s.graph)

  const context = useMemo(() => {
    const document = createDocument(graph)
    const registry = new ServiceRegistry()

    // Register only the services Explorer needs
    const eventBus = registry.get('eventBus')
    const selectionManager = new SelectionManager(document, eventBus)
    registry.register('selection', selectionManager)

    registry.init(document)

    return { document, services: registry }
  }, [graph])

  return (
    <EditorProvider context={context}>
      {children}
    </EditorProvider>
  )
}