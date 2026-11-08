import { effectiveBuildingBase, toLocal, type CampusDocument, type TerrainSampler } from '@navi/core'

const SLAB_THICKNESS = 0.25

/**
 * Buildings as solid blocks for MapLibre fill-extrusion (owner 2026-11-07: buildings had no walls): one
 * block per building from the ground up to its roof. MapLibre lifts each extrusion by the ground at its
 * centroid, so heights are relative to that ground; base 0 sinks the block into the ground (a foundation).
 * "Cut away above" a floor stops the block at that floor's level, so its floor shows on top. Never zero
 * height (a zero-height top flickers in the ground surface). `baseOverride` draws one building at a draft
 * base (a live Shift+Z drag) without touching the document.
 */
export function buildSlabFeatures(
  document: CampusDocument,
  sampler: TerrainSampler,
  opts: { cutAboveFloorId?: string; baseOverride?: { buildingId: string; baseM: number } },
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const building of document.buildings) {
    const ring = building.footprint?.points ?? []
    if (ring.length < 3) continue
    const local = ring.map((p) => toLocal(sampler.grid, p))
    const cx = local.reduce((s, p) => s + p.x, 0) / local.length
    const cy = local.reduce((s, p) => s + p.y, 0) / local.length
    const ground = sampler.heightAt(cx, cy)
    const base = opts.baseOverride?.buildingId === building.id ? opts.baseOverride.baseM : effectiveBuildingBase(building, sampler)
    const floors = [...building.floors].sort((a, b) => a.elevation - b.elevation)
    if (floors.length === 0) continue
    const geometry: GeoJSON.Polygon = { type: 'Polygon', coordinates: [ring.map((p) => [p.lng, p.lat])] }
    const cut = opts.cutAboveFloorId ? floors.find((f) => f.id === opts.cutAboveFloorId) : undefined
    if (cut) {
      const top = Math.max(base + cut.elevation - ground, SLAB_THICKNESS)
      features.push({ type: 'Feature', geometry, properties: { kind: 'cut', buildingId: building.id, floorId: cut.id, base: 0, top } })
      continue
    }
    const last = floors[floors.length - 1]
    // The building's height (the map editor's Building Height, as NAVI Web draws it); older buildings without one: its floors.
    const roof = base + (building.height > 0 ? building.height : last.elevation + (last.height ?? 3.5))
    features.push({ type: 'Feature', geometry, properties: { kind: 'block', buildingId: building.id, base: 0, top: Math.max(roof - ground, SLAB_THICKNESS) } })
  }
  return { type: 'FeatureCollection', features }
}
