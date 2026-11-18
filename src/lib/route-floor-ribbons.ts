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
  for (let i = 1; i < input.path.length; i++) {
    const a = input.node(input.path[i - 1]), b = input.node(input.path[i])
    if (!a || !b || a.floor !== b.floor || a.floor > input.topFloor) continue
    if (a.buildingId !== input.buildingId || b.buildingId !== input.buildingId) continue
    const elevation = input.elevations.get(a.floor)
    if (elevation === undefined || !Number.isFinite(elevation)) continue
    const base = elevation + SLAB_TOP_M
    for (const [part, half, lift] of [['edge', EDGE_HALF_M, 0.02], ['core', CORE_HALF_M, 0.05]] as const) {
      const ring = quad(a, b, half)
      if (!ring) continue
      features.push({ type: 'Feature', properties: { part, floor: a.floor, base: base + lift - 0.02, height: base + lift }, geometry: { type: 'Polygon', coordinates: [ring] } })
    }
  }
  return { type: 'FeatureCollection', features }
}
