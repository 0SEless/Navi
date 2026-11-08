import type { CampusDocument } from '@navi/core'

export type Frame = { minLng: number; maxLng: number; minLat: number; maxLat: number }

/**
 * The frame of a campus with no route points yet (2026-11-08): its boundary, else its buildings' outlines; null when
 * it has neither. (A campus of buildings and terrain only was framed on 0°, 0°, so the map opened off Africa.)
 */
export function campusFrame(document: CampusDocument): Frame | null {
  const points = (document.boundary?.points?.length ?? 0) >= 3
    ? document.boundary!.points
    : (document.buildings ?? []).flatMap((b) => b.footprint?.points ?? [])
  if (points.length === 0) return null
  return points.reduce<Frame>((bb, p) => ({
    minLng: Math.min(bb.minLng, p.lng), maxLng: Math.max(bb.maxLng, p.lng),
    minLat: Math.min(bb.minLat, p.lat), maxLat: Math.max(bb.maxLat, p.lat),
  }), { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity })
}
