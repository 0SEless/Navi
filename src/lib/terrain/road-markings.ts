import { offsetRoadLine, toLatLng, toLocal, type SiteRoadSurface } from '@navi/core'

/** Road look (section 4, shared by Studio and NAVI Web): dark asphalt roads, light paving paths. */
export const ROAD_COLOR = '#4b4f55'
export const PATH_COLOR = '#ddd6c8'

/** Roads this wide or wider have two lanes: a dashed centre line. */
export const TWO_LANE_WIDTH_M = 5
/** Edge lines sit this far inside the road's edge. */
const EDGE_INSET_M = 0.3
/** A footpath edge line sits this far inside the path's side, metres. */
const PATH_EDGE_INSET_M = 0.1

/**
 * Road markings (section 4): white edge lines along both sides of every road, and a dashed centre line
 * on two-lane roads (≥ 5 m). Paths (`pedestrian`) have none. Lines drape on the terrain like the surface.
 */
type P = { x: number; y: number }
/** Markings stop this far before another road's edge. */
const JUNCTION_GAP_M = 0.2
const STEP_M = 0.5

function distanceToLine(p: P, line: P[]): number {
  let best = Infinity
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i]
    const dx = b.x - a.x, dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
  }
  return best
}

export function roadMarkings(roads: SiteRoadSurface[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  const first = roads.find((r) => r.polyline.length > 0)?.polyline[0]
  const frame = { originLat: first?.lat ?? 0, originLng: first?.lng ?? 0 }
  const surfaces = roads
    .filter((r) => r.polyline.length >= 2 && r.width > 0)
    .map((r) => ({ id: r.id, line: r.polyline.map((p) => toLocal(frame, p)), reach: r.width / 2 + JUNCTION_GAP_M }))
  // A marking breaks where it crosses another road (junctions), so roads read as joined, not cut.
  const line = (roadId: string, kind: 'edge' | 'centre' | 'path-edge', points: Array<{ lat: number; lng: number }>) => {
    const others = surfaces.filter((s) => s.id !== roadId)
    const local = points.map((p) => toLocal(frame, p))
    let run: P[] = []
    const flush = () => {
      if (run.length >= 2) features.push({ type: 'Feature', properties: { roadId, kind }, geometry: { type: 'LineString', coordinates: run.map((p) => { const q = toLatLng(frame, p); return [q.lng, q.lat] }) } })
      run = []
    }
    for (let i = 0; i < local.length; i++) {
      const a = local[i], b = local[i + 1] ?? a
      const steps = i + 1 < local.length ? Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / STEP_M)) : 1
      for (let k = 0; k < steps; k++) {
        if (i + 1 >= local.length && k > 0) break
        const t = i + 1 < local.length ? k / steps : 0
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
        if (others.some((o) => distanceToLine(p, o.line) < o.reach)) flush()
        else run.push(p)
      }
    }
    flush()
  }
  for (const road of roads) {
    if (road.polyline.length < 2 || !(road.width > 0)) continue
    if (road.type === 'pedestrian') {
      // A footpath's own edge (Campus walkway, owner 2026-11-17): just inside its sides; shown only by designs that edge paths.
      const side = Math.max(0.1, road.width / 2 - PATH_EDGE_INSET_M)
      line(road.id, 'path-edge', offsetRoadLine(road, side))
      line(road.id, 'path-edge', offsetRoadLine(road, -side))
      continue
    }
    const inset = Math.max(0.2, road.width / 2 - EDGE_INSET_M)
    line(road.id, 'edge', offsetRoadLine(road, inset))
    line(road.id, 'edge', offsetRoadLine(road, -inset))
    if (road.width >= TWO_LANE_WIDTH_M) line(road.id, 'centre', road.polyline)
  }
  return { type: 'FeatureCollection', features }
}
