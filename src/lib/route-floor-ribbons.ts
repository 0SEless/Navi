/**
 * The route on the floors (owner 2026-11-18: "there is no routing showing on the floor … it should show on the
 * floor"). In the 2.5D building view each floor stands at its own height, so the flat route line lies hidden under the
 * slabs. The parts of the route inside the open building are drawn as thin strips lying on their floors instead: a
 * white edge and a route-coloured core, for every floor up to the one shown. The outdoor part and stair climbs (a
 * change of floor) are left to the route line.
 */
type LatLng = { lat: number; lng: number }
type RouteNode = LatLng & { floor: number; buildingId?: string }

/** Top of a floor slab above the floor's elevation, metres (FloorArchitectureLayer's slab). */
const SLAB_TOP_M = 0.3
const CORE_HALF_M = 0.45
const EDGE_HALF_M = 0.7
/** Pieces in a drawn climb between floors. */
const CLIMB_PIECES = 10

export interface RouteFloorRibbonsInput {
  path: readonly string[]
  node: (id: string) => RouteNode | undefined
  /** The building shown in 2.5D; undefined = none. */
  buildingId?: string
  /** Floor level → elevation (metres) of the open building's floors. */
  elevations: ReadonlyMap<number, number>
  /** The floor shown: floors above it are not in the stack. */
  topFloor: number
}

function quad(a: LatLng, b: LatLng, half: number): number[][] | null {
  const mLat = 111320, mLng = 111320 * Math.cos((a.lat * Math.PI) / 180)
  const dx = (b.lng - a.lng) * mLng, dy = (b.lat - a.lat) * mLat
  const len = Math.hypot(dx, dy)
  if (!(len > 0.05)) return null
  // Extend each piece by its half width so consecutive pieces overlap at the bends.
  const ux = dx / len, uy = dy / len, nx = -uy * half, ny = ux * half
  const ex = ux * half, ey = uy * half
  const p = (x: number, y: number) => [a.lng + x / mLng, a.lat + y / mLat]
  const ax = -ex, ay = -ey, bx = dx + ex, by = dy + ey
  const ring = [p(ax + nx, ay + ny), p(bx + nx, by + ny), p(bx - nx, by - ny), p(ax - nx, ay - ny)]
  return [...ring, ring[0]]
}

export function routeFloorRibbons(input: RouteFloorRibbonsInput): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = []
  if (!input.buildingId) return { type: 'FeatureCollection', features }
  const inside = (n: RouteNode) => n.buildingId === input.buildingId
  const lerp = (a: LatLng, b: LatLng, t: number): LatLng => ({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t })
  // `bottom`: a climb piece is a solid step down to the previous piece's height, so the climb reads as one ramp.
  const strip = (a: LatLng, b: LatLng, floor: number, top: number, climb: boolean, bottom = top) => {
    for (const [part, half, lift] of [['edge', EDGE_HALF_M, 0.02], ['core', CORE_HALF_M, 0.05]] as const) {
      const ring = quad(a, b, half)
      if (!ring) continue
      features.push({ type: 'Feature', properties: { part, floor, climb, base: Math.min(bottom, top) + lift - 0.02, height: top + lift }, geometry: { type: 'Polygon', coordinates: [ring] } })
    }
  }
  for (let i = 1; i < input.path.length; i++) {
    const a = input.node(input.path[i - 1]), b = input.node(input.path[i])
    // Parts touching the open building: inside it, its doors, and the way in from outside (owner 2026-11-18).
    if (!a || !b || (!inside(a) && !inside(b))) continue
    const ea = input.elevations.get(a.floor), eb = input.elevations.get(b.floor)
    if (ea === undefined || eb === undefined || !Number.isFinite(ea) || !Number.isFinite(eb)) continue
    if (a.floor === b.floor) {
      if (a.floor <= input.topFloor) strip(a, b, a.floor, ea + SLAB_TOP_M, false)
      continue
    }
    // A change of floor (stairs, a hillside entrance): a climb of short strips rising from one floor to the other,
    // drawn when it starts or ends on a shown floor.
    if (Math.min(a.floor, b.floor) > input.topFloor) continue
    for (let k = 0; k < CLIMB_PIECES; k++) {
      const t0 = k / CLIMB_PIECES, t1 = (k + 1) / CLIMB_PIECES
      const h = ea + (eb - ea) * ((k + 0.5) / CLIMB_PIECES) + SLAB_TOP_M
      const prev = ea + (eb - ea) * ((k - 0.5) / CLIMB_PIECES) + SLAB_TOP_M
      strip(lerp(a, b, t0), lerp(a, b, t1), Math.max(a.floor, b.floor), h, true, prev)
    }
  }
  return { type: 'FeatureCollection', features }
}
