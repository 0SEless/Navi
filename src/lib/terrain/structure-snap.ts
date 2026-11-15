import type { Building, CampusDocument, StructureEnd } from '@navi/core'

type LatLng = { lat: number; lng: number }
type Screen = { x: number; y: number }
type Floor = Building['floors'][number]

export const SNAP_PX = 14

function nearestOnSegment(p: Screen, a: Screen, b: Screen): { t: number; distance: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return { t, distance: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) }
}

function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
}

/**
 * Where a dragged stair end attaches: a floor slab edge within 14 px (the chosen floor, else the
 * building's top floor), else a road within 14 px (the point on the road), else the ground under the
 * pointer. Distances are on screen, so the snap feels the same at every zoom; slab edges are projected
 * at their floor height, so in 3D the edge you see is the edge you hit. A slab end records where it
 * was drawn (`last`) for the marker shown if its building is deleted.
 */
export function snapStructureEnd(
  document: CampusDocument,
  pointer: LatLng,
  project: (p: LatLng, heightM: number) => Screen,
  opts: {
    floorId?: string | null
    tolerancePx?: number
    /** The pointer on screen; default = the pointer projected at its ground height. */
    screen?: Screen
    slabHeight?: (building: Building, floor: Floor) => number
    groundHeight?: (p: LatLng) => number
  },
): StructureEnd {
  const tolerance = opts.tolerancePx ?? SNAP_PX
  const groundHeight = opts.groundHeight ?? (() => 0)
  const slabHeight = opts.slabHeight ?? ((_building: Building, floor: Floor) => floor.elevation)
  const here = opts.screen ?? project(pointer, groundHeight(pointer))

  let slab: { distance: number; end: StructureEnd } | null = null
  for (const building of document.buildings ?? []) {
    const points = building.footprint?.points ?? []
    const closed = points.length > 1 && points[0].lat === points[points.length - 1].lat && points[0].lng === points[points.length - 1].lng
    const ring = closed ? points.slice(0, -1) : points
    if (ring.length < 2 || building.floors.length === 0) continue
    const floor = building.floors.find((f) => f.id === opts.floorId)
      ?? [...building.floors].sort((a, b) => b.elevation - a.elevation)[0]
    const heightM = slabHeight(building, floor)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      const hit = nearestOnSegment(here, project(a, heightM), project(b, heightM))
      if (hit.distance <= tolerance && (!slab || hit.distance < slab.distance)) {
        const at = lerp(a, b, hit.t)
        slab = { distance: hit.distance, end: { kind: 'slab', buildingId: building.id, floorId: floor.id, edgeIndex: i, edgeT: hit.t, last: { ...at, heightM } } }
      }
    }
  }
  if (slab) return slab.end

  // Pointing inside a building (owner 2026-11-15: stairs did not touch buildings): its nearest wall, at the floor.
  const metres = toMetres(pointer)
  for (const building of document.buildings ?? []) {
    const points = building.footprint?.points ?? []
    const closed = points.length > 1 && points[0].lat === points[points.length - 1].lat && points[0].lng === points[points.length - 1].lng
    const ring = closed ? points.slice(0, -1) : points
    if (ring.length < 3 || building.floors.length === 0) continue
    const local = ring.map((q) => metres.of(q))
    if (!insideRing({ x: 0, y: 0 }, local)) continue
    const floor = building.floors.find((f) => f.id === opts.floorId)
      ?? [...building.floors].sort((a, b) => b.elevation - a.elevation)[0]
    let best: { i: number; t: number; distance: number } | null = null
    for (let i = 0; i < local.length; i++) {
      const hit = nearestOnSegment({ x: 0, y: 0 }, local[i], local[(i + 1) % local.length])
      if (!best || hit.distance < best.distance) best = { i, t: hit.t, distance: hit.distance }
    }
    if (best) {
      const at = lerp(ring[best.i], ring[(best.i + 1) % ring.length], best.t)
      return { kind: 'slab', buildingId: building.id, floorId: floor.id, edgeIndex: best.i, edgeT: best.t, last: { ...at, heightM: slabHeight(building, floor) } }
    }
  }

  // Roads: anywhere on the road surface (or within the snap distance of its centre line); the end lands on the
  // road's edge on the pointer's side, so a stair meets the road instead of stopping in its middle.
  let road: { distance: number; end: StructureEnd } | null = null
  for (const r of document.roads ?? []) {
    const line = r.polyline?.points ?? []
    const half = Math.max(0, (r.width ?? 0) / 2)
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]
      const b = line[i]
      const onScreen = nearestOnSegment(here, project(a, groundHeight(a)), project(b, groundHeight(b)))
      const am = metres.of(a)
      const bm = metres.of(b)
      const onGround = nearestOnSegment({ x: 0, y: 0 }, am, bm)
      if (onScreen.distance > tolerance && onGround.distance > half) continue
      if (road && onGround.distance >= road.distance) continue
      const cx = am.x + (bm.x - am.x) * onGround.t
      const cy = am.y + (bm.y - am.y) * onGround.t
      const len = Math.hypot(bm.x - am.x, bm.y - am.y) || 1
      let nx = -(bm.y - am.y) / len
      let ny = (bm.x - am.x) / len
      if (nx * (0 - cx) + ny * (0 - cy) < 0) { nx = -nx; ny = -ny }
      road = { distance: onGround.distance, end: { kind: 'road', roadId: r.id, position: metres.back({ x: cx + nx * half, y: cy + ny * half }) } }
    }
  }
  if (road) return road.end

  return { kind: 'ground', position: { lat: pointer.lat, lng: pointer.lng } }
}

/** Ground metres around `origin` (equirectangular; fine over a campus). */
function toMetres(origin: LatLng) {
  const kx = 111320 * Math.cos((origin.lat * Math.PI) / 180)
  const ky = 111320
  return {
    of: (p: LatLng) => ({ x: (p.lng - origin.lng) * kx, y: (p.lat - origin.lat) * ky }),
    back: (q: Screen): LatLng => ({ lat: origin.lat + q.y / ky, lng: origin.lng + q.x / kx }),
  }
}

function insideRing(p: Screen, ring: Screen[]): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}
