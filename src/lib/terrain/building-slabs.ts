import { effectiveBuildingBase, toLocal, type CampusDocument, type TerrainSampler } from '@navi/core'

const SLAB_THICKNESS = 0.25

/**
 * Solid floor slabs for MapLibre fill-extrusion: one opaque slab per floor at its real height plus a
 * roof. MapLibre lifts each extrusion by the ground at its centroid, so heights are given relative to
 * that ground; the ground-floor slab has base 0, which MapLibre sinks into the ground (a foundation).
 * Floors above `cutAboveFloorId` (and the roof) are left out ("Cut away above").
 */
export function buildSlabFeatures(document: CampusDocument, sampler: TerrainSampler, opts: { cutAboveFloorId?: string }): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const building of document.buildings) {
    const ring = building.footprint?.points ?? []
    if (ring.length < 3) continue
    const local = ring.map((p) => toLocal(sampler.grid, p))
    const cx = local.reduce((s, p) => s + p.x, 0) / local.length
    const cy = local.reduce((s, p) => s + p.y, 0) / local.length
    const ground = sampler.heightAt(cx, cy)
    const base = effectiveBuildingBase(building, sampler)
    const floors = [...building.floors].sort((a, b) => a.elevation - b.elevation)
    const cut = opts.cutAboveFloorId ? floors.findIndex((f) => f.id === opts.cutAboveFloorId) : -1
    const shown = cut >= 0 ? floors.slice(0, cut + 1) : floors
    const geometry: GeoJSON.Polygon = { type: 'Polygon', coordinates: [ring.map((p) => [p.lng, p.lat])] }
    shown.forEach((floor, index) => {
      const level = base + floor.elevation
      features.push({
        type: 'Feature', geometry,
        properties: { kind: 'slab', buildingId: building.id, floorId: floor.id, base: index === 0 ? 0 : level - SLAB_THICKNESS - ground, top: level - ground },
      })
    })
    if (cut < 0 && floors.length > 0) {
      const last = floors[floors.length - 1]
      const roof = base + last.elevation + (last.height ?? 3.5)
      features.push({ type: 'Feature', geometry, properties: { kind: 'roof', buildingId: building.id, base: roof - SLAB_THICKNESS - ground, top: roof - ground } })
    }
  }
  return { type: 'FeatureCollection', features }
}
