'use client'

import { useEffect, use, useMemo, useState } from 'react'
import Link from 'next/link'
import { useCampusMapStore } from '@/store/campus-map-store'
import { useGraphStore } from '@/store/graph-store'
import { DatasetWorkspace } from '@/components/pages/DatasetWorkspace'
import { resolveEffectiveDatasetDocument } from '@/components/pages/dataset/resolve-effective-document'

/**
 * /dataset/[id] — Dataset Management workspace route.
 *
 * Two hydration layers (both reused from existing patterns, no new stores):
 *   1. campus store (Phase 2): resolves the CampusMap record for the header.
 *   2. graph store (Phase 3): loadMapData(id) hydrates authoredDocument from
 *      localStorage + Supabase (same mechanism the Studio edit route uses).
 *
 * Effective document (Phase 3.2): the workspace receives
 * `authoredDocument ?? createDocument(legacy graph)` — the same resolution
 * EditorBridge performs in Studio — so graph-only campuses (legacy snapshots
 * without authored_document) render through the identical in-memory
 * projection instead of the "document not available" state. The projection
 * is derived in a memo, never persisted, and never mutates the store graph.
 *
 * While the authored document is loading we show a loading state; if the
 * load was attempted and no load is in flight, we show a retryable error
 * state. The workspace itself renders whenever the CampusMap exists and
 * handles a null document with honest per-view states.
 */
export default function DatasetWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  // Layer 1: campus record (Phase 2 behaviour, unchanged).
  const maps = useCampusMapStore((s) => s.maps)
  const load = useCampusMapStore((s) => s.load)
  const campus = maps.find((m) => m.id === id)

  // Layer 2: authored document via the graph store.
  const loadMapData = useGraphStore((s) => s.loadMapData)
  const currentMapId = useGraphStore((s) => s.currentMapId)
  const syncStatus = useGraphStore((s) => s.syncStatus)
  const authoredDocument = useGraphStore((s) => s.authoredDocument)
  const graph = useGraphStore((s) => s.graph)

  // Which map id we have already kicked a load attempt for. This must be
  // state, not a ref: after a failed load the store settles back to 'idle',
  // which is indistinguishable from "never attempted" unless the attempt is
  // recorded where render can read it. A route change clears stale markers
  // during render so a fresh id always starts in the loading state.
  const [attemptedFor, setAttemptedFor] = useState<string | null>(null)
  if (attemptedFor !== null && attemptedFor !== id) setAttemptedFor(null)

  // Hydrate the campus store from localStorage + server (same as Studio).
  useEffect(() => { load() }, [load])

  // Hydrate the authored document for this campus (localStorage → Supabase).
  useEffect(() => {
    if (currentMapId !== id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- attempt marker pairs with the loadMapData call below; the store's failure state ('idle') is indistinguishable from pre-attempt without it
      setAttemptedFor(id)
      loadMapData(id)
    }
  }, [id, currentMapId, loadMapData])

  // Effective document: authored snapshot when present, otherwise the
  // canonical in-memory projection of the legacy graph for THIS campus.
  // The graph may only be projected once its currentMapId matches the route
  // (a stale graph from another campus must never leak into this workspace).
  const effectiveDocument = useMemo(
    () => resolveEffectiveDatasetDocument(authoredDocument, currentMapId === id ? graph : null),
    [authoredDocument, currentMapId, id, graph],
  )

  if (!campus) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--navi-text-secondary)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navi-text)' }}>
          {maps.length === 0 ? 'Loading campus…' : 'Campus not found'}
        </div>
        <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 320 }}>
          {maps.length === 0
            ? 'Loading authored campuses.'
            : 'This campus does not exist or was removed. It may still be open in NAVI Studio if it has not synced yet.'}
        </div>
        <Link
          href="/dataset"
          style={{ marginTop: 4, padding: '7px 16px', background: 'var(--navi-primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
        >
          Back to Dataset Management
        </Link>
      </div>
    )
  }

  // Authored document not hydrated yet for this campus.
  if (currentMapId !== id) {
    const loadInFlight = syncStatus === 'syncing' || syncStatus === 'checking'
    const loadFailed = attemptedFor === id && !loadInFlight

    if (!loadFailed) {
      return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--navi-text-secondary)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navi-text)' }}>
            Loading campus data…
          </div>
          <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 320 }}>
            Loading the authored document for {campus.name}.
          </div>
        </div>
      )
    }

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--navi-text-secondary)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navi-text)' }}>
          Campus data could not be loaded
        </div>
        <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 340 }}>
          The authored document for {campus.name} could not be loaded. It may not have been
          synced from NAVI Studio yet.
        </div>
        <button
          type="button"
          onClick={() => loadMapData(id)}
          style={{ marginTop: 4, padding: '7px 16px', background: 'var(--navi-primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          Retry
        </button>
        <Link
          href="/dataset"
          style={{ fontSize: 12, color: 'var(--navi-text-secondary)' }}
        >
          Back to campus selection
        </Link>
      </div>
    )
  }

  // key={id}: switching campuses remounts the workspace so its transient
  // explorer state (selection, expansion, active tab) resets cleanly.
  return <DatasetWorkspace key={id} campus={campus} document={effectiveDocument} />
}
