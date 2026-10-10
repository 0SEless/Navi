'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { CampusDocument } from '@navi/core'
import { useCampusMapStore } from '@/store/campus-map-store'
import { useGraphStore } from '@/store/graph-store'
import { resolveEffectiveDatasetDocument } from '@/components/pages/dataset/resolve-effective-document'
import { VirtualTourWorkspace } from '@/features/panorama-management/components/VirtualTourWorkspace'
import { tourWorkspaceHref } from '@/features/panorama-management/tour-selectors'
import {
  buildPanoramaViews,
  filterPanoramas,
  type PanoramaFilters,
} from '@/features/panorama-management/selectors'
import {
  resolveCampusSelection,
  resolvePanoramaManagementPhase,
  shouldCanonicalizeCampusUrl,
} from '@/features/panorama-management/state'

/**
 * PM-3 — Panorama Management container.
 *
 * Owns campus selection (URL-driven), document hydration and the read-only
 * Virtual Tour inventory.
 *
 * ── Canonical data wiring ────────────────────────────────────────────────────
 * Inventory = `resolveEffectiveDatasetDocument(authoredDocument, graph).panoramas`.
 *
 * `resolveEffectiveDatasetDocument` prefers the canonical authored document and
 * only falls back to an in-memory legacy graph projection for old graph-only
 * snapshots. That compatibility path is a property of the HELPER, not of this
 * page: the page itself never reads `graph.nodes`, `hasPanorama`,
 * `metadata.panoramaId`, `metadata.panoramaUrl` or `N-pano-*` to build the
 * inventory. Since VT-1, a legacy projection yields zero panoramas — see
 * `resolve-effective-document.ts` and ADR 024.
 *
 * This page reads LIVE authored state. It does not read backup files, does not
 * reconstruct from a backup graph, and does not use VT-2 legacy recovery.
 *
 * ── Read-only ───────────────────────────────────────────────────────────────
 * No create / update / delete / restore command and no upload is invoked here.
 * `loadMapData` is used purely to read.
 */
const DEFAULT_FILTERS: PanoramaFilters = {
  query: '',
  scope: 'all',
  image: 'all',
  health: 'all',
  buildingId: 'all',
}

export default function PanoramaManagementClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const maps = useCampusMapStore((state) => state.maps)
  const loadCampuses = useCampusMapStore((state) => state.load)

  const authoredDocument = useGraphStore((state) => state.authoredDocument)
  const currentMapId = useGraphStore((state) => state.currentMapId)
  const syncStatus = useGraphStore((state) => state.syncStatus)
  const syncError = useGraphStore((state) => state.syncError)
  const loadMapData = useGraphStore((state) => state.loadMapData)

  // STEP 2 — reuse the existing campus lifecycle.
  const [campusesLoading, setCampusesLoading] = useState(true)
  const [campusListFailed, setCampusListFailed] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- attempt markers pair with the loadCampuses() call; useCampusMapStore exposes no loading/error state, so an empty campus list before an attempt is indistinguishable from one that failed
    setCampusesLoading(true)
    setCampusListFailed(false)
    try {
      loadCampuses()
    } catch {
      if (!cancelled) setCampusListFailed(true)
    }
    if (!cancelled) setCampusesLoading(false)
    return () => {
      cancelled = true
    }
  }, [loadCampuses, reloadToken])

  const knownCampusIds = useMemo(() => maps.map((map) => map.id), [maps])
  const requestedCampusId = searchParams.get('campus')
  const requestedSceneId = searchParams.get('pano')

  const selection = useMemo(
    () => resolveCampusSelection({ requestedCampusId, knownCampusIds, currentMapId }),
    [requestedCampusId, knownCampusIds, currentMapId],
  )

  // STEP 3-B — an unknown `?campus=` keeps its id so the UI can report
  // "campus not found". It is deliberately NOT nulled: a null id would be
  // indistinguishable from "nothing selected" and would silently fall back.
  const selectedCampusId =
    selection.kind === 'selected' ? selection.campusId : selection.kind === 'unknown-campus' ? selection.campusId : null
  const selectedCampusKnown = selection.kind !== 'unknown-campus'
  // Only a genuinely resolved campus may be loaded.
  const loadableCampusId = selection.kind === 'selected' ? selection.campusId : null

  // STEP 3-D — canonicalise an implicit single-campus resolution into the URL so
  // the URL stays the single source of truth for the selected campus.
  useEffect(() => {
    if (!shouldCanonicalizeCampusUrl(requestedCampusId, selection)) return
    router.replace(tourWorkspaceHref(selectedCampusId ?? '', requestedSceneId ?? undefined))
  }, [requestedCampusId, requestedSceneId, selection, selectedCampusId, router])

  // STEP 8 — async campus-switch safety.
  //
  // `graph-store.fetchFromSupabase` sets `currentMapId`/`authoredDocument`
  // unconditionally after its await, so a slow campus-A load CAN land after the
  // user has already switched to campus B. The store's freshness reconciler has
  // a `currentMapId !== mapId` guard, but this load path does not.
  //
  // Rather than redesigning store concurrency (explicitly out of scope), the
  // page re-asserts ownership: whenever the loaded campus is not the selected
  // one, it re-issues the load for the selected campus, and it renders nothing
  // derived from a misaligned document. A late A landing therefore flips nothing
  // on screen — B simply reloads and stays in charge.
  const lastRequestedRef = useRef<string | null>(null)
  useEffect(() => {
    if (loadableCampusId === null) return
    if (currentMapId === loadableCampusId) {
      lastRequestedRef.current = loadableCampusId
      return
    }
    if (lastRequestedRef.current === loadableCampusId) return
    lastRequestedRef.current = loadableCampusId
    loadMapData(loadableCampusId)
  }, [loadableCampusId, currentMapId, loadMapData])

  // STEP 7 — the ownership gate. Document-derived data is only ever computed
  // when the loaded campus provably IS the selected campus.
  const campusAligned = loadableCampusId !== null && currentMapId === loadableCampusId
  const effectiveDocument: CampusDocument | null = useMemo(
    () => (campusAligned ? resolveEffectiveDatasetDocument(authoredDocument, useGraphStore.getState().graph) : null),
    [campusAligned, authoredDocument],
  )

  const [filters, setFilters] = useState<PanoramaFilters>(DEFAULT_FILTERS)

  // Search changes explorer results, while selection and the viewer retain
  // the full canonical inventory.
  const inventory = useMemo(() => buildPanoramaViews(effectiveDocument), [effectiveDocument])
  const results = useMemo(() => filterPanoramas(inventory, filters), [inventory, filters])

  const phase = useMemo(
    () =>
      resolvePanoramaManagementPhase({
        campusesLoading,
        campusListFailed,
        selectedCampusId,
        selectedCampusKnown,
        campusAligned,
        hasDocument: effectiveDocument !== null,
        syncStatus,
        syncError,
        inventory,
        filteredCount: results.length,
      }),
    [
      campusesLoading,
      campusListFailed,
      selectedCampusId,
      selectedCampusKnown,
      campusAligned,
      effectiveDocument,
      syncStatus,
      syncError,
      inventory,
      results.length,
    ],
  )

  // STEP 20 — Retry re-runs the existing load path. No refresh, no mutation.
  const handleRetry = useCallback(() => {
    setReloadToken((token) => token + 1)
    if (loadableCampusId !== null) {
      lastRequestedRef.current = null
      loadMapData(loadableCampusId)
    }
  }, [loadableCampusId, loadMapData])

  // A Building filter is only meaningful for the campus it was chosen on.
  // Switching campus clears it (a user action, not an effect), so a stale
  // building id can never hide every row of the newly selected campus.
  const handleCampusChange = useCallback(
    (campusId: string) => {
      setFilters(DEFAULT_FILTERS)
      router.replace(`/panoramas?campus=${encodeURIComponent(campusId)}`)
    },
    [router],
  )

  return (
    <VirtualTourWorkspace
      key={selectedCampusId}
      phase={phase}
      campuses={maps.map((map) => ({ id: map.id, name: map.name }))}
      selectedCampusId={selectedCampusId}
      inventory={inventory}
      results={results}
      panoramas={effectiveDocument?.panoramas ?? []}
      requestedSceneId={requestedSceneId}
      query={filters.query}
      onQueryChange={query => setFilters({ ...DEFAULT_FILTERS, query })}
      onSceneSelect={sceneId => { if (selectedCampusId) router.replace(tourWorkspaceHref(selectedCampusId, sceneId)) }}
      onCampusChange={handleCampusChange}
      onRetry={handleRetry}
    />
  )
}
