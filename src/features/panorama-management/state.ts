import type { PanoramaView } from './selectors'

/**
 * PM-3 — Panorama Management page state resolution.
 *
 * A pure resolver so every page state (STEP 19) is decidable — and testable —
 * without a store, a router or a DOM.
 *
 * The states are deliberately DISTINCT. In particular:
 *   • "this campus has no panoramas" (E) is not "no panoramas match your
 *     search or filters" (F), and neither is "this campus has no authored
 *     dataset yet" (G);
 *   • a campus that exists but is not selected (C) is not a campus that was
 *     requested and cannot be found (D).
 *
 * Collapsing these into one "No panoramas found" message is exactly what the
 * legacy page did, and it is the defect PM-3 fixes.
 */

export type SyncStatus = 'idle' | 'syncing' | 'checking' | 'synced' | 'error' | 'conflict'

export type PanoramaManagementPhase =
  /** A — the campus list itself has not resolved yet. */
  | { kind: 'campus-list-loading' }
  /** B — the campus list failed to load. */
  | { kind: 'campus-list-failed'; message: string }
  /** C — campuses are known, but none is selected. */
  | { kind: 'no-campus-selected' }
  /** D — `?campus=` names a campus that does not exist. Never silently falls back. */
  | { kind: 'campus-not-found' }
  /** The selected campus is still loading, or its document is not yet ours. */
  | { kind: 'loading' }
  /** B — the selected campus failed to load. */
  | { kind: 'load-failed'; message: string }
  /** H — sync/conflict, surfaced per existing graph-store semantics. */
  | { kind: 'sync'; message: string }
  /** G — no authored dataset for this campus. */
  | { kind: 'document-unavailable' }
  /** Ready. `empty` distinguishes E (zero panoramas) from F (zero matches). */
  | { kind: 'ready'; empty: 'none' | 'no-matches' }

export interface ResolvePhaseInput {
  /** Campus list lifecycle. */
  campusesLoading: boolean
  campusListFailed: boolean

  /** Campus selection. */
  selectedCampusId: string | null
  /** Whether `selectedCampusId` exists in the loaded campus list. */
  selectedCampusKnown: boolean

  /** Ownership: is the loaded document actually the selected campus? */
  campusAligned: boolean

  /** Effective document availability. */
  hasDocument: boolean

  /** Store sync lifecycle for the selected campus. */
  syncStatus: SyncStatus
  syncError: string | null

  /** Inventory size, used only to pick E vs F once ready. */
  inventory: PanoramaView[]
  /** Filtered result size. */
  filteredCount: number
}

/**
 * Decide the page state. Order matters: campus-level failures outrank
 * document-level ones, because without a trustworthy campus there is nothing
 * meaningful to report about panoramas.
 */
export function resolvePanoramaManagementPhase(input: ResolvePhaseInput): PanoramaManagementPhase {
  if (input.campusesLoading) return { kind: 'campus-list-loading' }
  if (input.campusListFailed) {
    return {
      kind: 'campus-list-failed',
      message: 'Campuses could not be loaded. Check your connection and try again.',
    }
  }

  // Campus selection (C/D) precedes document concerns.
  if (input.selectedCampusId === null) return { kind: 'no-campus-selected' }
  if (!input.selectedCampusKnown) return { kind: 'campus-not-found' }

  // Ownership guard (STEP 7): until the loaded document provably belongs to the
  // selected campus we stay in a loading/stale state rather than rendering
  // another campus's panoramas.
  if (!input.campusAligned) return { kind: 'loading' }

  if (input.syncStatus === 'error') {
    return {
      kind: 'load-failed',
      message: input.syncError ?? 'This campus could not be loaded. Please try again.',
    }
  }
  if (input.syncStatus === 'conflict') {
    return {
      kind: 'sync',
      message: 'This campus has unsaved changes from another session. Resolve the conflict in Studio.',
    }
  }
  if (input.syncStatus === 'syncing' || input.syncStatus === 'checking') return { kind: 'loading' }

  if (!input.hasDocument) return { kind: 'document-unavailable' }

  // E vs F: a genuinely empty campus is not an over-narrowed filter.
  if (input.inventory.length === 0) return { kind: 'ready', empty: 'none' }
  if (input.filteredCount === 0) return { kind: 'ready', empty: 'no-matches' }
  return { kind: 'ready', empty: 'none' }
}

// ── STEP 3: URL campus contract ─────────────────────────────────────────────

export type CampusSelection =
  | { kind: 'selected'; campusId: string }
  | { kind: 'unknown-campus'; campusId: string }
  | { kind: 'no-campus-selected' }

export interface ResolveCampusSelectionInput {
  /** Raw `?campus=` value from the URL, or null when absent. */
  requestedCampusId: string | null
  /** Known campus ids, from the campus list store. */
  knownCampusIds: string[]
  /** `currentMapId` from the graph store. */
  currentMapId: string | null
}

/**
 * Resolve which campus the page is for. The URL is authoritative.
 *
 *  A. `?campus=` present and known   → use it
 *  B. `?campus=` present and unknown → campus-not-found (NO silent fallback)
 *  C. no param + `currentMapId` known → use `currentMapId`
 *  D. no param + exactly one campus   → use it (caller may canonicalise the URL)
 *  E. no param + several campuses + no usable `currentMapId` → nothing selected
 *
 * Note `selectedMapId` from the campus store is deliberately NOT consulted: PM-2
 * established it as dead state with no active writer.
 */
export function resolveCampusSelection(input: ResolveCampusSelectionInput): CampusSelection {
  const known = new Set(input.knownCampusIds)

  // A / B — an explicit request is never second-guessed.
  if (input.requestedCampusId !== null) {
    return known.has(input.requestedCampusId)
      ? { kind: 'selected', campusId: input.requestedCampusId }
      : { kind: 'unknown-campus', campusId: input.requestedCampusId }
  }

  // C — an active current campus is a legitimate default.
  if (input.currentMapId !== null && known.has(input.currentMapId)) {
    return { kind: 'selected', campusId: input.currentMapId }
  }

  // D — a single campus needs no disambiguation.
  if (known.size === 1) return { kind: 'selected', campusId: [...known][0] }

  // E — genuinely ambiguous.
  return { kind: 'no-campus-selected' }
}

/** True when the page should canonicalise the URL to the resolved campus. */
export function shouldCanonicalizeCampusUrl(
  requestedCampusId: string | null,
  resolved: CampusSelection,
): boolean {
  return requestedCampusId === null && resolved.kind === 'selected'
}