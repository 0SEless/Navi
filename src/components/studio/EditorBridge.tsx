'use client'

import { useState, useEffect, type ReactNode } from 'react'
import {
  EditorProvider,
  SelectionBridge,
  SelectionOrigin,
  findEntityById,
  NavigationCompiler,
  createEditorContext,
} from '@navi/editor'
import type { EntitySelector, PersistenceAdapter } from '@navi/editor'
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

export function EditorBridge({ children }: { children: ReactNode }) {
  // Created ONCE from the initial graph — enforces the document lifetime invariant.
  const persistenceAdapter: PersistenceAdapter = {
    save: () => useGraphStore.getState().save(),
    syncToSupabase: () => useGraphStore.getState().syncToSupabase(),
    publish: async () => ({ success: true, version: '1.0.0' }),
  }
  const navCompiler = new NavigationCompiler(createCompilerAdapter())
  const [context] = useState(() => createEditorContext(
    useGraphStore.getState().graph,
    persistenceAdapter,
    navCompiler,
  ))

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
