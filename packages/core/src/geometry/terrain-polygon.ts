import type { LatLng } from '../types/coordinates'
import type { TerrainArea, TerrainVerticalDatum } from '../types/entities'

const EPSILON = 1e-12

function cross(a: LatLng, b: LatLng, c: LatLng): number {
  return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng)
}

function onSegment(a: LatLng, b: LatLng, p: LatLng): boolean {
  return Math.abs(cross(a, b, p)) <= EPSILON
    && p.lng >= Math.min(a.lng, b.lng) - EPSILON && p.lng <= Math.max(a.lng, b.lng) + EPSILON
    && p.lat >= Math.min(a.lat, b.lat) - EPSILON && p.lat <= Math.max(a.lat, b.lat) + EPSILON
}

function segmentsIntersect(a: LatLng, b: LatLng, c: LatLng, d: LatLng, includeTouch: boolean): boolean {
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true
  if (!includeTouch) return false
  return (Math.abs(abC) <= EPSILON && onSegment(a, b, c))
    || (Math.abs(abD) <= EPSILON && onSegment(a, b, d))
    || (Math.abs(cdA) <= EPSILON && onSegment(c, d, a))
    || (Math.abs(cdB) <= EPSILON && onSegment(c, d, b))
}

function pointInPolygon(point: LatLng, polygon: readonly LatLng[], includeBoundary: boolean): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]
    const b = polygon[i]
    if (onSegment(a, b, point)) return includeBoundary
    const intersects = ((a.lat > point.lat) !== (b.lat > point.lat))
      && point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng
    if (intersects) inside = !inside
  }
  return inside
}

/** True for a finite, non-degenerate simple polygon; input order is preserved. */
export function isSimpleTerrainPolygon(points: readonly LatLng[]): boolean {
  if (points.length < 3 || points.some((point) => !Number.isFinite(point.lat) || !Number.isFinite(point.lng)
    || point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180)) return false
  if (points.some((point, index) => {
    const next = points[(index + 1) % points.length]
    return Math.abs(point.lat - next.lat) <= EPSILON && Math.abs(point.lng - next.lng) <= EPSILON
  })) return false
  let twiceArea = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    twiceArea += a.lng * b.lat - b.lng * a.lat
  }
  if (!Number.isFinite(twiceArea) || Math.abs(twiceArea) <= EPSILON) return false

  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    for (let j = i + 1; j < points.length; j++) {
      if (j === i || j === (i + 1) % points.length || i === (j + 1) % points.length) continue
      if (segmentsIntersect(a, b, points[j], points[(j + 1) % points.length], true)) return false
    }
  }
  return true
}

/** Validate the optional published terrain pair. Both fields are absent on
 * legacy bundles; if either is present, both must be valid together. */
export function isValidTerrainPublication(areas: unknown, datum: unknown): boolean {
  if (areas === undefined && datum === undefined) return true
  if (!Array.isArray(areas) || !isTerrainVerticalDatum(datum)) return false
  const ids = new Set<string>()
  for (const value of areas) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const area = value as Record<string, unknown>
    if (typeof area.id !== 'string' || area.id.trim() === '' || ids.has(area.id)) return false
    if (typeof area.name !== 'string' || area.name.trim() === '') return false
    if (typeof area.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(area.color)) return false
    if (!Number.isFinite(area.elevationMeters) || !Array.isArray(area.points) || !isSimpleTerrainPolygon(area.points as LatLng[])) return false
    ids.add(area.id)
  }
  return true
}

export function isTerrainVerticalDatum(value: unknown): value is TerrainVerticalDatum {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const datum = value as Record<string, unknown>
  return datum.kind === 'campus-local'
    && typeof datum.name === 'string' && datum.name.trim() !== ''
    && typeof datum.zeroReference === 'string' && datum.zeroReference.trim() !== ''
    && datum.elevationStatus === 'authored-not-surveyed'
}

function polygonsOverlap(a: readonly LatLng[], b: readonly LatLng[]): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length], false)) return true
    }
  }
  return a.some((point) => pointInPolygon(point, b, false))
    || b.some((point) => pointInPolygon(point, a, false))
}

/** Reports overlapping authored polygons with different elevation values. */
export function findTerrainElevationConflicts(areas: readonly TerrainArea[]): Array<{ areaIds: [string, string]; elevationsMeters: [number, number] }> {
  const conflicts: Array<{ areaIds: [string, string]; elevationsMeters: [number, number] }> = []
  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      const first = areas[i]
      const second = areas[j]
      if (first.elevationMeters !== second.elevationMeters && polygonsOverlap(first.points, second.points)) {
        conflicts.push({ areaIds: [first.id, second.id], elevationsMeters: [first.elevationMeters, second.elevationMeters] })
      }
    }
  }
  return conflicts
}
