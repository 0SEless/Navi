import type { PlanAlignment } from '@navi/core'
import { resetFloorPlanAlignment } from '@/lib/floor-plan-inspector'
import { resolvePlanAlignment } from '@/lib/floor-plan-transform'

export interface FloorPlanSourceDimensions {
  width: number
  height: number
}

export interface FloorPlanStorageScope {
  supabaseUrl: string
  mapId: string
  buildingId: string
  floorLevel: number
}

export interface FloorPlanReference {
  planImageId?: string | null
}

export const FLOOR_PLAN_ASPECT_TOLERANCE = 0.01

/**
 * Resolve the active source while respecting an explicit null in floorData.
 * Legacy floorPlanUrls are consulted only when the newer field is absent.
 */
export function resolveFloorPlanUrl(
  legacyUrl?: string | null,
  floorData?: FloorPlanReference | null,
  fallbackUrl?: string | null,
): string | undefined {
  if (floorData && Object.prototype.hasOwnProperty.call(floorData, 'planImageId')) {
    // `undefined` is the legacy/absent shape; only an explicit null means
    // that a previously published or legacy URL was intentionally removed.
    if (floorData.planImageId !== undefined) return floorData.planImageId ?? undefined
  }
  return legacyUrl ?? fallbackUrl ?? undefined
}

function validDimensions(dimensions?: FloorPlanSourceDimensions): dimensions is FloorPlanSourceDimensions {
  return Boolean(
    dimensions &&
    Number.isFinite(dimensions.width) && dimensions.width > 0 &&
    Number.isFinite(dimensions.height) && dimensions.height > 0,
  )
}

/**
 * A replacement is compatible only when both raster sources expose finite,
 * non-zero dimensions and their aspect ratios differ by at most one percent.
 */
export function areFloorPlanSourcesCompatible(
  previous?: FloorPlanSourceDimensions,
  replacement?: FloorPlanSourceDimensions,
): boolean {
  if (!validDimensions(previous) || !validDimensions(replacement)) return false
  const previousRatio = previous.width / previous.height
  const replacementRatio = replacement.width / replacement.height
  return Math.abs(previousRatio - replacementRatio) / Math.max(previousRatio, replacementRatio) <= FLOOR_PLAN_ASPECT_TOLERANCE
}

/** Preserve visual fields while applying the deterministic replacement policy. */
export function buildFloorPlanReplaceAlignment(
  existing: PlanAlignment | null | undefined,
  previous?: FloorPlanSourceDimensions,
  replacement?: FloorPlanSourceDimensions,
): PlanAlignment {
  if (areFloorPlanSourcesCompatible(previous, replacement)) {
    const resolved = resolvePlanAlignment(existing)
    return {
      offset: { ...resolved.offset },
      scaleX: resolved.scaleX,
      scaleY: resolved.scaleY,
      rotation: resolved.rotation,
      opacity: resolved.opacity,
      locked: resolved.locked,
    }
  }
  return resetFloorPlanAlignment(existing)
}

/** Read raster dimensions without making a storage or document mutation. */
export function readFloorPlanImageDimensions(url: string | null | undefined): Promise<FloorPlanSourceDimensions | undefined> {
  if (!url || typeof Image === 'undefined') return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      resolve(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0 ? { width, height } : undefined)
    }
    image.onerror = () => resolve(undefined)
    image.src = url
  })
}

/**
 * Return true only for a URL created by this floor's managed storage prefix.
 * Data URLs, external URLs, and another floor's path are never owned here.
 */
export function isOwnedFloorPlanUrl(url: string | null | undefined, scope: FloorPlanStorageScope): boolean {
  if (!url || url.startsWith('data:')) return false
  try {
    const parsed = new URL(url)
    const expectedOrigin = new URL(scope.supabaseUrl).origin
    const prefix = `/storage/v1/object/public/floor-plans/${encodeURIComponent(scope.mapId)}/${encodeURIComponent(scope.buildingId)}/floor-${scope.floorLevel}-`
    return parsed.origin === expectedOrigin && parsed.pathname.startsWith(prefix)
  } catch {
    return false
  }
}
