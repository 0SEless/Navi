import type { CampusDocument } from '@navi/core'

/** Building-owned normal cover references. No panorama/floor-plan assets or resolution. */
export const BUILDING_COVER_WRITE_FIELD = 'imageUrl' as const
const COVER_READ_FIELDS = [BUILDING_COVER_WRITE_FIELD, 'photoUrl', 'image'] as const

export interface BuildingCoverOwner {
  metadata?: Record<string, unknown>
}

/** Read aliases for existing data; any future writer targets metadata.imageUrl only. */
export function getBuildingCover(owner: BuildingCoverOwner): { reference: string; source: string } | null {
  for (const field of COVER_READ_FIELDS) {
    const value = owner.metadata?.[field]
    if (typeof value === 'string' && value.trim()) return { reference: value.trim(), source: `metadata.${field}` }
  }
  return null
}

/** Opaque references are reported honestly, never resolved through panorama APIs. */
export function isBuildingCoverSource(reference: string): boolean {
  if (/[\u0000-\u001f\u007f]/.test(reference)) return false
  if (reference.startsWith('/') && !reference.startsWith('//')) return true
  try {
    const url = new URL(reference.startsWith('//') ? `https:${reference}` : reference)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Return a new authored document with one building cover updated. Normal
 * writes target only metadata.imageUrl; removal clears all known read aliases.
 */
export function updateBuildingCoverMetadata(
  document: CampusDocument,
  buildingId: string,
  reference: string | null,
): CampusDocument | null {
  const buildingIndex = document.buildings.findIndex((building) => building.id === buildingId)
  if (buildingIndex < 0) return null

  const building = document.buildings[buildingIndex]
  const metadata: Record<string, unknown> = { ...building.metadata }
  if (reference === null) {
    delete metadata.imageUrl
    delete metadata.photoUrl
    delete metadata.image
  } else {
    metadata[BUILDING_COVER_WRITE_FIELD] = reference
  }

  const buildings = [...document.buildings]
  buildings[buildingIndex] = { ...building, metadata }
  return { ...document, buildings }
}
