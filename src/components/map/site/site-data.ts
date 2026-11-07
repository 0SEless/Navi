import {
  BUILT_IN_MATERIALS, BUILT_IN_PRESETS, buildStructureMesh, contourSegments, createSiteGround, structurePath, toLatLng, toLocal,
  type SiteArtifact,
} from '@navi/core'
import type { Building } from '@/types/nav-types'

type LatLng = { lat: number; lng: number }

const SLAB_THICKNESS = 0.25
const DEFAULT_FLOOR_HEIGHT = 3.5

/** The site's local frame origin (the baked terrain's, else the first boundary corner). */
export function siteOrigin(site: SiteArtifact): LatLng {
  return site.terrain
    ? { lat: site.terrain.originLat, lng: site.terrain.originLng }
    : { lat: site.boundary[0]?.lat ?? 0, lng: site.boundary[0]?.lng ?? 0 }
}

/** The campus ground area (the boundary) as one polygon: NAVI Web draws only the campus. */
export function siteGroundArea(site: SiteArtifact): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring = site.boundary.map((p): [number, number] => [p.lng, p.lat])
  if (ring.length > 0) ring.push(ring[0])
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }
}

/** Every published stair and ramp as one mesh (local metres around `origin`) at their resolved heights. */
export function siteStructuresMesh(site: SiteArtifact): { origin: LatLng; mesh: Float32Array } {
  const origin = siteOrigin(site)
  const frame = { originLat: origin.lat, originLng: origin.lng }
  const ground = createSiteGround(site)
  const parts: Float32Array[] = []
  for (const s of site.structures) {
    const [a, b] = s.resolved.path
    if (!a || !b) continue
    const start = { ...toLocal(frame, a), h: s.resolved.startHeightM }
    const end = { ...toLocal(frame, b), h: s.resolved.endHeightM }
    const preset = site.presets.find((p) => p.id === s.presetId) ?? BUILT_IN_PRESETS.find((p) => p.id === s.presetId) ?? BUILT_IN_PRESETS[0]
    parts.push(buildStructureMesh({
      path: structurePath(start, end, s.bend ? toLocal(frame, s.bend) : undefined),
      startH: start.h, endH: end.h, form: s.form, width: s.width, underneath: s.underneath, railings: s.railings,
      ...(s.flight ? { flight: s.flight } : {}),
      ...(s.landings ? { landings: s.landings } : {}),
      groundAt: (x, y) => ground(toLatLng(frame, { x, y })),
      look: preset.look,
      materials: BUILT_IN_MATERIALS,
    }))
  }
  const mesh = new Float32Array(parts.reduce((n, part) => n + part.length, 0))
  let offset = 0
  for (const part of parts) {
    mesh.set(part, offset)
    offset += part.length
  }
  return { origin, mesh }
}

/**
 * Solid floor slabs and a roof per building (3D, MapLibre fill-extrusion): from the published base, floors
 * spread evenly over the building's height, heights relative to the ground under the building's centre
 * (MapLibre lifts each extrusion by that ground).
 */
export function siteSlabFeatures(site: SiteArtifact, buildings: Building[]): GeoJSON.FeatureCollection {
  const ground = createSiteGround(site)
  const features: GeoJSON.Feature[] = []
  for (const building of buildings) {
    const ring = building.footprint ?? []
    if (ring.length < 3) continue
    const centre = { lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length, lng: ring.reduce((s, p) => s + p.lng, 0) / ring.length }
    const g = ground(centre)
    const base = site.buildings.find((b) => b.id === building.id)?.baseM ?? building.baseElevation ?? 0
    const levels = Math.max(1, building.floors?.length ?? 1)
    const floorHeight = building.height > 0 ? building.height / levels : DEFAULT_FLOOR_HEIGHT
    const closed = [...ring, ring[0]].map((p) => [p.lng, p.lat])
    const geometry: GeoJSON.Polygon = { type: 'Polygon', coordinates: [closed] }
    for (let i = 0; i < levels; i++) {
      const level = base + i * floorHeight
      features.push({ type: 'Feature', geometry, properties: { kind: 'slab', buildingId: building.id, base: i === 0 ? 0 : level - SLAB_THICKNESS - g, top: level - g } })
    }
    const roof = base + levels * floorHeight
    features.push({ type: 'Feature', geometry, properties: { kind: 'roof', buildingId: building.id, base: roof - SLAB_THICKNESS - g, top: roof - g } })
  }
  return { type: 'FeatureCollection', features }
}

/** Contour lines of the campus ground every `stepM` metres (sampled every 2 m over the campus box). */
export function siteContourLines(site: SiteArtifact, stepM = 5): GeoJSON.FeatureCollection {
  if (!site.terrain || site.boundary.length < 3) return { type: 'FeatureCollection', features: [] }
  const origin = siteOrigin(site)
  const frame = { originLat: origin.lat, originLng: origin.lng }
  const ground = createSiteGround(site)
  const local = site.boundary.map((p) => toLocal(frame, p))
  const bbox = {
    minX: Math.min(...local.map((p) => p.x)), minY: Math.min(...local.map((p) => p.y)),
    maxX: Math.max(...local.map((p) => p.x)), maxY: Math.max(...local.map((p) => p.y)),
  }
  const levels = contourSegments((x, y) => ground(toLatLng(frame, { x, y })), bbox, { step: stepM, cell: 2 })
  return {
    type: 'FeatureCollection',
    features: levels.flatMap((level) => level.segments.map(([a, b]) => {
      const pa = toLatLng(frame, a)
      const pb = toLatLng(frame, b)
      return {
        type: 'Feature' as const,
        properties: { elevation: level.elevationM },
        geometry: { type: 'LineString' as const, coordinates: [[pa.lng, pa.lat], [pb.lng, pb.lat]] },
      }
    })),
  }
}
