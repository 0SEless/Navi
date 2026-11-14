import type { Opening, RoomDoor, Wall, Window } from '../types/entities'

const EPSILON = 1e-9
const LEGACY_WINDOW_HEIGHT = 1.2
const LEGACY_DOOR_HEIGHT = 2.1

// Only physical aperture fields are needed; compiled runtime records omit editor metadata.
type AttachedDoor = Pick<RoomDoor, 'id' | 'width' | 'wallAttachment'>
interface Aperture {
  id: string
  wallId: string
  start: number
  end: number
  bottom: number
  top: number
}
export interface WallVolumeDiagnostic {
  entityId: string
  code: string
  message: string
}
export interface WallOpeningVolumes {
  collection: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  diagnostics: WallVolumeDiagnostic[]
}

/**
 * Pure, local-meter solid geometry shared by editor and publication consumers.
 * Opening/legacy Window offsets are leading edges; attached Door offsets are
 * centers. No source record is migrated or corrected by rendering.
 *
 * Missing legacy heights use a render-only 1.2m window / 2.1m door default.
 * Composite legacy wall references are never guessed onto canonical walls.
 */
export function buildWallOpeningVolumes(
  walls: readonly Wall[],
  openings: readonly Opening[],
  doors: readonly AttachedDoor[],
  windows: readonly Window[],
  base: number,
): WallOpeningVolumes {
  const collection: WallOpeningVolumes['collection'] = { type: 'FeatureCollection', features: [] }
  const diagnostics: WallVolumeDiagnostic[] = []
  const report = (entityId: string, code: string, message: string) => diagnostics.push({ entityId, code, message })
  if (!Number.isFinite(base)) {
    report('*', 'BASE_INVALID', 'Wall presentation base must be finite.')
    return { collection, diagnostics }
  }

  const byId = new Map<string, Wall>()
  for (const wall of walls) {
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
    if (![wall.start.x, wall.start.y, wall.end.x, wall.end.y, wall.height, wall.thickness, length, base + wall.height].every(Number.isFinite)
      || length <= EPSILON || wall.height <= EPSILON || wall.thickness <= EPSILON || base + wall.height <= base) {
      report(wall.id, 'WALL_INVALID', 'Wall dimensions and endpoints must be finite and its length, height and thickness positive.')
      continue
    }
    if (byId.has(wall.id)) {
      report(wall.id, 'WALL_DUPLICATE', 'Duplicate wall identity cannot produce another solid.')
      continue
    }
    byId.set(wall.id, wall)
  }

  const buckets = new Map<string, Aperture[]>()
  const add = (id: string, wallId: string, start: number, width: number, bottom: number, height: number) => {
    const wall = byId.get(wallId)
    if (!wall) {
      report(id, 'APERTURE_HOST_MISSING', `Opening host "${wallId}" is not a valid canonical wall; existing data was left unchanged.`)
      return
    }
    if (![start, width, bottom, height].every(Number.isFinite) || width <= EPSILON || height <= EPSILON) {
      report(id, 'APERTURE_INVALID', 'Opening dimensions must be finite and width/height positive.')
      return
    }
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
    const end = start + width
    const top = bottom + height
    if (![end, top].every(Number.isFinite)) {
      report(id, 'APERTURE_INVALID', 'Opening span exceeds the finite coordinate range.')
      return
    }
    const clamped = { id, wallId, start: Math.max(0, start), end: Math.min(length, end), bottom: Math.max(0, bottom), top: Math.min(wall.height, top) }
    if (clamped.end - clamped.start <= EPSILON || clamped.top - clamped.bottom <= EPSILON) {
      report(id, 'APERTURE_INVALID', 'Opening does not intersect a positive area of its host wall.')
      return
    }
    if (Math.abs(clamped.start - start) > EPSILON || Math.abs(clamped.end - end) > EPSILON
      || Math.abs(clamped.bottom - bottom) > EPSILON || Math.abs(clamped.top - top) > EPSILON) {
      report(id, 'APERTURE_CLAMPED', 'Opening exceeds its host bounds; only the intersecting area is omitted from the render geometry.')
    }
    const bucket = buckets.get(wallId) ?? []
    // Old exports can carry the same aperture in two collections. Normalize by
    // exact host/span geometry for rendering, not by deleting either record.
    if (bucket.some(other => Math.abs(other.start - clamped.start) <= EPSILON && Math.abs(other.end - clamped.end) <= EPSILON
      && Math.abs(other.bottom - clamped.bottom) <= EPSILON && Math.abs(other.top - clamped.top) <= EPSILON)) return
    bucket.push(clamped)
    buckets.set(wallId, bucket)
  }

  for (const opening of openings) {
    if (opening.type !== 'door' && opening.type !== 'window') {
      report(opening.id, 'APERTURE_INVALID', 'Only door and window openings are supported.')
      continue
    }
    add(opening.id, opening.wallId, opening.offset, opening.width,
      opening.type === 'door' ? 0 : opening.sillHeight ?? 0.9,
      opening.height ?? (opening.type === 'door' ? LEGACY_DOOR_HEIGHT : LEGACY_WINDOW_HEIGHT))
  }
  for (const door of doors) {
    const attachment = door.wallAttachment
    if (attachment === undefined) continue
    if (!attachment) {
      report(door.id, 'APERTURE_INVALID', 'Door attachment must identify a wall, offset and opening height.')
      continue
    }
    add(door.id, attachment.wallId, attachment.offset - door.width / 2, door.width, 0, attachment.openingHeight)
  }
  for (const window of windows) {
    add(window.id, window.wallId, window.offset, window.width, window.sillHeight, LEGACY_WINDOW_HEIGHT)
  }

  for (const wall of byId.values()) {
    const apertures = (buckets.get(wall.id) ?? []).sort((a, b) => a.start - b.start || a.end - b.end || a.bottom - b.bottom || a.top - b.top || a.id.localeCompare(b.id))
    for (let i = 0; i < apertures.length; i++) {
      if (apertures.slice(0, i).some(other => Math.min(other.end, apertures[i].end) - Math.max(other.start, apertures[i].start) > EPSILON
        && Math.min(other.top, apertures[i].top) - Math.max(other.bottom, apertures[i].bottom) > EPSILON)) {
        report(apertures[i].id, 'APERTURE_OVERLAP', 'Overlapping existing apertures are rendered as one union; no saved records were changed.')
      }
    }
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
    const ux = (wall.end.x - wall.start.x) / length
    const uy = (wall.end.y - wall.start.y) / length
    const nx = -uy * wall.thickness / 2
    const ny = ux * wall.thickness / 2
    const stops = [0, length, ...apertures.flatMap(aperture => [aperture.start, aperture.end])]
      .sort((a, b) => a - b).filter((value, index, values) => index === 0 || value - values[index - 1] > EPSILON)
    for (let i = 1; i < stops.length; i++) {
      const start = stops[i - 1], end = stops[i]
      const midpoint = (start + end) / 2
      const occupied = apertures.filter(aperture => aperture.start < midpoint && aperture.end > midpoint)
        .map(aperture => [aperture.bottom, aperture.top] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
      const gaps: Array<[number, number]> = []
      let cursor = 0
      for (const [low, high] of occupied) {
        if (low - cursor > EPSILON) gaps.push([cursor, low])
        cursor = Math.max(cursor, high)
      }
      if (wall.height - cursor > EPSILON) gaps.push([cursor, wall.height])
      const sx = wall.start.x + ux * start, sy = wall.start.y + uy * start
      const ex = wall.start.x + ux * end, ey = wall.start.y + uy * end
      for (const [low, high] of gaps) {
        // Finite individual inputs can still lose precision at extreme datums.
        // Never emit a top equal to its base, even for a thin sill/header.
        if (!Number.isFinite(base + high) || base + high <= base + low) {
          report(wall.id, 'WALL_PRECISION', 'A solid wall piece cannot be represented at this base height.')
          continue
        }
        const id = apertures.length === 0 ? wall.id : `${wall.id}:solid:${start}:${end}:${low}:${high}`
        collection.features.push({
          type: 'Feature', id,
          properties: { id, wallId: wall.id, base: base + low, height: base + high },
          geometry: { type: 'Polygon', coordinates: [[
            [sx + nx, sy + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [sx - nx, sy - ny], [sx + nx, sy + ny],
          ]] },
        })
      }
    }
  }
  return { collection, diagnostics }
}
