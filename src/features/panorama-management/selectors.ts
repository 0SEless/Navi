import type { CampusDocument, Panorama } from '@navi/core'
import {
  validatePanoramaCoordinates,
  validatePanoramaHotspots,
} from '@navi/core'

/**
 * PM-3 — Pure Virtual Tour selectors for Panorama Management.
 *
 * ── Architecture invariants (VT-1 / ADR 024) ────────────────────────────────
 * This module is the ONLY place Panorama Management derives Panorama data, and
 * its sole input is `CampusDocument.panoramas` — the canonical authored Virtual
 * Tour source.
 *
 * It deliberately has NO dependency on:
 *   • the navigation graph, `Graph`, `GraphAdapter`, route topology or A*
 *   • `NavNode.hasPanorama`, `metadata.panoramaId`, `metadata.panoramaUrl`
 *   • `N-pano-*` scene nodes
 *   • `panorama_assets` (the binary registry, not the Panorama inventory)
 *   • campus backup / VT-2 reconstruction
 *
 * Because the graph is not even a parameter, no graph topology can influence
 * Panorama counts, search, filters or metrics.
 *
 * Pure and React-free: every export is a plain function, safe to call from a
 * render-path memo and trivially testable without a store or a DOM.
 */

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * D9 scope classification.
 *
 * Derived from `buildingId` ONLY. In particular `floor === 0` is a valid
 * ground-floor value for a Building panorama and must never imply Outdoor.
 */
export type PanoramaScope = 'outdoor' | 'building'

/** Virtual Tour health. Never derived from navigation projection. */
export type PanoramaHealth =
  | 'ready'
  | 'missing-image'
  | 'needs-attention'

export type PanoramaScopeFilter = 'all' | PanoramaScope
export type PanoramaImageFilter = 'all' | 'has-image' | 'missing-image'
export type PanoramaHealthFilter = 'all' | 'ready' | 'needs-attention'

export interface PanoramaFilters {
  query: string
  scope: PanoramaScopeFilter
  image: PanoramaImageFilter
  health: PanoramaHealthFilter
  buildingId: string
}

export interface PanoramaPositionView {
  kind: 'world' | 'local' | 'unknown'
  /** Already formatted for display; `undefined` for an unknown position. */
  display: string
  lat?: number
  lng?: number
  x?: number
  y?: number
}

export interface PanoramaIssueView {
  code: string
  message: string
  severity: 'error' | 'warning'
  /** Present for hotspot issues so the UI can point at the offending hotspot. */
  hotspotIndex?: number
}

/** Everything a read-only Panorama card needs, precomputed and flattened. */
export interface PanoramaView {
  id: string
  label: string
  scope: PanoramaScope
  buildingId: string | undefined
  /** `null` for outdoor panoramas. */
  buildingName: string | null
  /** Raw authored floor level; `null` for outdoor. */
  floor: number | null
  /** Authored floor label or `Floor <n>` fallback; `null` for outdoor. */
  floorLabel: string | null
  heading: number
  /** The durable R2 object-key reference. NOT a URL. */
  imageAssetId: string
  hasImage: boolean
  missingImage: boolean
  hotspotCount: number
  health: PanoramaHealth
  hasValidationError: boolean
  /** Human-readable context for any validation/hotspot issue found. */
  issues: PanoramaIssueView[]
  position: PanoramaPositionView
}

export interface PanoramaMetrics {
  total: number
  ready: number
  missingImage: number
  needsAttention: number
}

/** Distinct buildings present in the inventory, for the contextual filter. */
export interface PanoramaBuildingOption {
  buildingId: string
  name: string
  count: number
}

const UNKNOWN_BUILDING = 'Unknown building'

// ── STEP 12: scope classification ───────────────────────────────────────────

/**
 * Outdoor ⇔ `buildingId === undefined`.
 *
 * `floor` is never consulted: `floor: 0` is a legitimate Building ground floor
 * and `floor: undefined` on a Building is still a Building.
 */
export function getPanoramaScope(panorama: Panorama): PanoramaScope {
  return panorama.buildingId === undefined ? 'outdoor' : 'building'
}

// ── STEP 13/14: building + floor resolution ────────────────────────────────

/**
 * Resolve the authored building name for a Panorama's campus-local context.
 * Returns `null` when there is no building (outdoor) or the id is unknown —
 * the Panorama is still shown, never hidden, and no building is invented.
 */
export function resolvePanoramaBuildingName(
  document: CampusDocument | null,
  buildingId: string | undefined,
): string | null {
  if (!document || buildingId === undefined) return null
  const building = document.buildings.find((candidate) => candidate.id === buildingId)
  if (!building) return null
  return building.name || UNKNOWN_BUILDING
}

/**
 * Resolve the display label for a Building Panorama's floor.
 *
 * Prefers the authored `Floor.label` (so ground floor keeps its real project
 * name, e.g. "Ground Floor"), then falls back to `Floor <number>`. Outdoor
 * panoramas have no floor label.
 */
export function resolvePanoramaFloorLabel(
  document: CampusDocument | null,
  buildingId: string | undefined,
  floor: number | undefined,
): string | null {
  if (buildingId === undefined || floor === undefined) return null
  const building = document?.buildings.find((candidate) => candidate.id === buildingId)
  const authored = building?.floors.find((candidate) => candidate.level === floor)
  if (authored?.label) return authored.label
  return `Floor ${floor}`
}

// ── STEP 10: canonical validation ───────────────────────────────────────────

export interface PanoramaValidationState {
  hasError: boolean
  issues: PanoramaIssueView[]
}

/**
 * Run the CANONICAL Virtual Tour validators for one Panorama:
 *   • `validatePanoramaCoordinates` (D9 position semantics)
 *   • `validatePanoramaHotspots`   (hotspot targets and ranges)
 *
 * Both are pure `@navi/core` functions. No EditorBridge, GraphAdapter,
 * transformer or routing engine is constructed — this is why the health model
 * can run outside Studio.
 *
 * `allPanoramaIds` is the full canonical id list, needed because a navigation
 * hotspot's target is another Panorama (a Virtual Tour transition, not a route).
 */
export function getPanoramaValidationState(
  panorama: Panorama,
  allPanoramaIds: string[],
): PanoramaValidationState {
  const issues: PanoramaIssueView[] = [
    ...validatePanoramaCoordinates(panorama).map((issue) => ({
      code: issue.code,
      message: issue.message,
      severity: issue.severity,
    })),
    ...validatePanoramaHotspots(panorama, allPanoramaIds).map((issue) => ({
      code: issue.code,
      message: issue.message,
      severity: issue.severity,
      hotspotIndex: issue.hotspotIndex,
    })),
  ]
  return { hasError: issues.some((issue) => issue.severity === 'error'), issues }
}

// ── STEP 24: position presentation ──────────────────────────────────────────

/**
 * Format a Panorama position for display WITHOUT transforming it.
 *
 * Outdoor panoramas are world LatLng and display as geographic coordinates.
 * Building panoramas are building-local metres and display in metres — they are
 * never presented as, or converted into, GPS coordinates.
 */
export function getPanoramaPositionView(panorama: Panorama): PanoramaPositionView {
  const raw = panorama.position as unknown as Record<string, unknown>
  if (typeof raw.lat === 'number' && typeof raw.lng === 'number') {
    return {
      kind: 'world',
      lat: raw.lat,
      lng: raw.lng,
      display: `${raw.lat.toFixed(5)}, ${raw.lng.toFixed(5)}`,
    }
  }
  if (typeof raw.x === 'number' && typeof raw.y === 'number') {
    return {
      kind: 'local',
      x: raw.x,
      y: raw.y,
      display: `${raw.x.toFixed(1)} m E, ${raw.y.toFixed(1)} m N`,
    }
  }
  return { kind: 'unknown', display: 'Unknown position' }
}

// ── STEP 10: health ─────────────────────────────────────────────────────────

/**
 * Virtual Tour health for one Panorama.
 *
 *   MISSING IMAGE  — `imageAssetId.trim() === ''`
 *   NEEDS ATTENTION— missing image OR a Panorama validation error OR a hotspot
 *                    validation error
 *   READY          — not the above
 *
 * Warnings do NOT degrade health. Navigation projection health is never used.
 */
function resolveHealth(hasImage: boolean, hasValidationError: boolean): PanoramaHealth {
  if (hasValidationError) return 'needs-attention'
  if (!hasImage) return 'missing-image'
  return 'ready'
}

// ── Inventory ───────────────────────────────────────────────────────────────

/**
 * Build the read-only Panorama inventory.
 *
 * THE canonical inventory: `document.panoramas` and nothing else. A `null`
 * document (STEP 19-G "document unavailable") yields an empty inventory, which
 * the page distinguishes from a campus that genuinely has zero panoramas.
 */
export function buildPanoramaViews(document: CampusDocument | null): PanoramaView[] {
  if (!document) return []
  const panoramas = Array.isArray(document.panoramas) ? document.panoramas : []
  const allPanoramaIds = panoramas.map((panorama) => panorama.id)

  return panoramas.map((panorama) => {
    const scope = getPanoramaScope(panorama)
    const { hasError, issues } = getPanoramaValidationState(panorama, allPanoramaIds)
    // Whitespace-only means "authored but not yet uploaded" — still missing.
    const missingImage = panorama.imageAssetId.trim() === ''
    const buildingId = panorama.buildingId
    const floor = panorama.floor

    return {
      id: panorama.id,
      label: panorama.label,
      scope,
      buildingId,
      buildingName: resolvePanoramaBuildingName(document, buildingId),
      floor: floor ?? null,
      floorLabel: resolvePanoramaFloorLabel(document, buildingId, floor),
      heading: panorama.heading,
      imageAssetId: panorama.imageAssetId,
      hasImage: !missingImage,
      missingImage,
      hotspotCount: panorama.hotspots?.length ?? 0,
      health: resolveHealth(!missingImage, hasError),
      hasValidationError: hasError,
      issues,
      position: getPanoramaPositionView(panorama),
    }
  })
}

/**
 * Distinct buildings present in the inventory, for the contextual Building
 * filter. Callers omit the filter entirely when this has fewer than 2 entries.
 */
export function getPanoramaBuildingOptions(views: PanoramaView[]): PanoramaBuildingOption[] {
  const options = new Map<string, PanoramaBuildingOption>()
  for (const view of views) {
    if (view.buildingId === undefined) continue
    const existing = options.get(view.buildingId)
    if (existing) existing.count += 1
    else options.set(view.buildingId, { buildingId: view.buildingId, name: view.buildingName ?? UNKNOWN_BUILDING, count: 1 })
  }
  return [...options.values()]
}

// ── STEP 15: search ─────────────────────────────────────────────────────────

/**
 * Lowercased haystack for a Panorama card.
 *
 * Covers label, id, resolved building name and resolved floor label.
 * Deliberately EXCLUDES `imageAssetId`, hotspot internals and any route or node
 * identifier, so asset keys cannot be discovered through the UI.
 */
export function buildPanoramaSearchText(view: PanoramaView): string {
  return [view.label, view.id, view.buildingName, view.floorLabel]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
    .toLowerCase()
}

// ── STEP 16: filters ────────────────────────────────────────────────────────

/** Apply the query and every active filter. All active filters compose with AND. */
export function filterPanoramas(
  views: PanoramaView[],
  filters: PanoramaFilters,
): PanoramaView[] {
  const query = filters.query.trim().toLowerCase()
  return views.filter((view) => {
    if (query.length > 0 && !buildPanoramaSearchText(view).includes(query)) return false
    if (filters.scope !== 'all' && view.scope !== filters.scope) return false
    if (filters.image === 'has-image' && !view.hasImage) return false
    if (filters.image === 'missing-image' && view.hasImage) return false
    if (filters.health === 'ready' && view.health !== 'ready') return false
    if (filters.health === 'needs-attention' && view.health === 'ready') return false
    if (filters.buildingId !== 'all' && view.buildingId !== filters.buildingId) return false
    return true
  })
}

// ── STEP 17: metrics ────────────────────────────────────────────────────────

/**
 * Campus-level summary metrics, computed over the FULL inventory.
 *
 * The page must call this with the unfiltered inventory so that searching or
 * filtering never changes the header summary (STEP 18).
 *
 * Invariant by construction: `ready + needsAttention === total`, and a Panorama
 * with any number of problems is counted once in `needsAttention`.
 */
export function getPanoramaMetrics(views: PanoramaView[]): PanoramaMetrics {
  let missingImage = 0
  let needsAttention = 0
  for (const view of views) {
    if (view.missingImage) missingImage += 1
    if (view.health !== 'ready') needsAttention += 1
  }
  const total = views.length
  return { total, ready: total - needsAttention, missingImage, needsAttention }
}