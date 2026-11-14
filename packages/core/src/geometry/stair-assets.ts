import type { LocalCoord, LocalPolygon } from '../types/coordinates'
import type { StairLevelGeometry } from '../types/entities'
import { resolveStairDirectionCorners } from './stair-direction'

export interface StairAssetInput {
  id: string
  position: LocalCoord
  /** Canonical per-level rotation, in degrees. */
  rotation: number
  polygon?: LocalPolygon
  drawing?: StairLevelGeometry['drawing']
  landing?: StairLevelGeometry['landing']
  /** Known floor-to-floor rise in meters. */
  height?: number
}
export interface StairAssetDiagnostic { entityId: string; code: string; message: string }
export interface StairAssetVolumes {
  collection: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  diagnostics: StairAssetDiagnostic[]
}
type Point = [number, number]

function ringPoints(polygon: LocalPolygon): Point[] | undefined {
  if (!Array.isArray(polygon.points) || polygon.points.length < 4 || polygon.points.length > 257) return
  const points: Point[] = polygon.points.map(p => [p?.x, p?.y])
  if (!points.flat().every(Number.isFinite)) return
  const first = points[0], last = points[points.length - 1]
  // Local polygons from canonical floor geometry may omit the closing vertex.
  // Copy either representation; generated GeoJSON alone receives a closing point.
  return first[0] === last[0] && first[1] === last[1] ? points.slice(0, -1) : points
}

function positiveArea(points: Point[]): boolean {
  if (points.length < 3) return false
  const [ox, oy] = points[0]
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    area += (a[0] - ox) * (b[1] - oy) - (b[0] - ox) * (a[1] - oy)
  }
  return Number.isFinite(area) && Math.abs(area) > 0
}

/** Decorative solids only. Unknown rise/topology keeps the caller's marker fallback.
 * Straight parametric footprints follow canonical center anchoring and degree rotation.
 * Turning presets currently lack an authored flight path, so they are never straightened.
 */
export function buildStairAssetVolumes(inputs: readonly StairAssetInput[], base = 0): StairAssetVolumes {
  const result: StairAssetVolumes = { collection: { type: 'FeatureCollection', features: [] }, diagnostics: [] }
  for (const input of inputs) {
    const diagnostic = (code: string, message: string) => result.diagnostics.push({ entityId: input.id, code, message })
    const rise = input.height
    if (![base, input.position?.x, input.position?.y, input.rotation, rise].every(Number.isFinite)
      || rise === undefined || rise <= 0 || !Number.isFinite(base + rise) || base + rise <= base) {
      diagnostic('invalid-dimensions', 'Stair requires a finite position, rotation, datum and positive known floor rise.')
      continue
    }
    const drawing = input.drawing?.properties
    if (drawing && (input.drawing?.definitionId !== 'stair' || drawing.preset !== 'straight')) {
      diagnostic('unsupported-preset', 'This stair preset has no resolved flight path; retain its fallback marker.')
      continue
    }
    if (drawing && (!Number.isInteger(drawing.stepCount) || drawing.stepCount < 1 || drawing.stepCount > 128
      || ![drawing.stepWidth, drawing.stepDepth].every(n => Number.isFinite(n) && n > 0))) {
      diagnostic('invalid-dimensions', 'Authored stair count must be 1–128 with finite positive tread dimensions.')
      continue
    }
    const angle = (input.rotation % 360) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
    const toLocal = ([x, y]: Point): Point => {
      const dx = x - input.position.x, dy = y - input.position.y
      return [dx * cos + dy * sin, -dx * sin + dy * cos]
    }
    const toWorld = ([x, y]: Point): Point => [input.position.x + x * cos - y * sin, input.position.y + x * sin + y * cos]
    let points: Point[] | undefined
    if (input.polygon) points = ringPoints(input.polygon)?.map(toLocal)
    else if (drawing) {
      const hw = drawing.stepWidth / 2, hd = drawing.stepDepth * drawing.stepCount / 2
      points = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
    }
    if (!points || points.length !== 4 || !points.flat().every(Number.isFinite) || !positiveArea(points)) {
      diagnostic('missing-footprint', 'Stair requires a resolved rectangular footprint or valid parametric dimensions.')
      continue
    }
    const xmin = Math.min(...points.map(p => p[0])), xmax = Math.max(...points.map(p => p[0]))
    const ymin = Math.min(...points.map(p => p[1])), ymax = Math.max(...points.map(p => p[1]))
    const width = xmax - xmin, depth = ymax - ymin
    const epsilon = Math.max(width, depth) * 1e-8
    const corner = (p: Point) => `${Math.abs(p[0] - xmin) <= epsilon ? 0 : Math.abs(p[0] - xmax) <= epsilon ? 1 : 2}:${Math.abs(p[1] - ymin) <= epsilon ? 0 : Math.abs(p[1] - ymax) <= epsilon ? 1 : 2}`
    const corners = points.map(corner)
    if (!(width > 0 && depth > 0) || ![width, depth].every(Number.isFinite) || corners.some(c => c.includes('2')) || new Set(corners).size !== 4) {
      diagnostic('unsupported-footprint', 'Nonrectangular stairs need an authored flight path; retain their fallback marker.')
      continue
    }
    // With no authored treads, the explicit rectangle and rise permit illustrative
    // steps only. This never creates drawing data or changes the source document.
    const count = drawing?.stepCount ?? Math.max(2, Math.min(128, Math.ceil(rise / 0.18)))
    const cornerOrder = resolveStairDirectionCorners(drawing?.direction)
    if (!cornerOrder) {
      diagnostic('unsupported-direction', 'Stair direction is unknown; retain its fallback marker.')
      continue
    }
    // Authored cardinal directions use canonical local axes. Freeform stairs
    // retain the exact ordered edge-to-edge flight shown by their 2D arrow.
    const footprint: Point[] = drawing
      ? [[xmax, ymax], [xmin, ymax], [xmin, ymin], [xmax, ymin]]
      : points
    const [p0, p1, p2, p3] = cornerOrder.map(index => footprint[index])
    const interpolate = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    const features: GeoJSON.Feature<GeoJSON.Polygon>[] = []
    for (let i = 0; i < count; i++) {
      const a = i / count, b = (i + 1) / count
      const ring = [interpolate(p0, p3, a), interpolate(p1, p2, a), interpolate(p1, p2, b), interpolate(p0, p3, b)].map(toWorld)
      const height = base + rise * ((i + 1) / count)
      if (!ring.flat().every(Number.isFinite) || !positiveArea(ring) || !(height > base)) break
      const id = `${input.id}:step:${i}`
      features.push({ type: 'Feature', id, properties: { id, featureId: input.id, partType: 'step', base, height }, geometry: { type: 'Polygon', coordinates: [[...ring, [...ring[0]]]] } })
    }
    if (features.length !== count) {
      diagnostic('collapsed-geometry', 'Stair dimensions collapse at this datum; retain its fallback marker.')
      continue
    }
    result.collection.features.push(...features)
    if (!drawing) diagnostic('STAIR_APPROXIMATE', 'Illustrative treads use the resolved rectangular footprint and known rise; no authored tread count exists.')
    if (input.landing) {
      const ring = input.landing.polygon && ringPoints(input.landing.polygon)
      const height = base + Math.min(0.15, rise / count)
      if (!ring || !positiveArea(ring) || !(height > base)) {
        diagnostic('missing-landing-polygon', 'Landing has no finite positive polygon; retain its landing marker.')
      } else {
        const id = `${input.id}:landing`
        result.collection.features.push({ type: 'Feature', id, properties: { id, featureId: input.id, partType: 'landing', base, height }, geometry: { type: 'Polygon', coordinates: [[...ring, [...ring[0]]]] } })
      }
    }
  }
  return result
}
