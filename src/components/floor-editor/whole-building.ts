import { deriveRooms } from '@navi/editor/src/geometry/room-derivation'
import { buildStairTopVolumes, collectFloorDoors, floorStairInputs, stairFlightFloor, stairRise, stairWellHoles, type Building, type CoordinateTransformer } from '@navi/core'
import { stairTopReach } from '@navi/editor/src/geometry/stair-top-reach'
import { buildFloorArchitectureAssets } from '@/lib/floor-architecture-assets'

type Polygons = GeoJSON.FeatureCollection<GeoJSON.Polygon>
export type WholeBuildingKind = 'floors' | 'walls' | 'frames' | 'panels' | 'stairs' | 'glass' | 'warnings'
export type WholeBuildingPieces = Record<WholeBuildingKind, Polygons>

/** Thickness of the floor slab drawn under each upper floor, metres. */
const SLAB_M = 0.15

/**
 * Whole-building view (owner 2026-11-16): while one floor is edited at ground height, the floors above it stand at
 * their real height above it (elevation − active elevation), for MapLibre fill-extrusion. Each upper floor gets its
 * walls, doors, windows, stairs (flights on their own floor, tops where they arrive) and a thin floor slab over the
 * spaces its walls enclose, with a hole over any stair rising through it from inside the building. Floors below the
 * active floor are not drawn (extrusions cannot go below the ground the active floor stands on).
 */
export function wholeBuildingPieces(building: Building, activeLevel: number, hidden: ReadonlySet<number>, transformer: Pick<CoordinateTransformer, 'buildingLocalToWorld'>): WholeBuildingPieces {
  const out = Object.fromEntries((['floors', 'walls', 'frames', 'panels', 'stairs', 'glass', 'warnings'] as const).map((k) => [k, { type: 'FeatureCollection', features: [] }])) as unknown as WholeBuildingPieces
  const active = building.floors.find((f) => f.level === activeLevel)
  if (!active) return out
  const toWorld = (p: { x: number; y: number }): [number, number] | null => {
    const w = transformer.buildingLocalToWorld(p, building.id)
    return w && Number.isFinite(w.lng) && Number.isFinite(w.lat) ? [w.lng, w.lat] : null
  }
  for (const floor of building.floors) {
    if (floor.level <= activeLevel || hidden.has(floor.level)) continue
    const base = floor.elevation - active.elevation
    if (!(base > 0)) continue
    const { flights, tops } = floorStairInputs(building.staircases ?? [], building.floors, floor.level)
    const assets = buildFloorArchitectureAssets({
      buildingId: building.id, transformer, walls: floor.walls ?? [], openings: floor.openings ?? [], doors: collectFloorDoors(floor),
      windows: floor.windows ?? [], stairs: flights, stairTops: tops, base,
    })
    const tag = (collection: Polygons): GeoJSON.Feature<GeoJSON.Polygon>[] => collection.features.map((f) => ({ ...f, properties: { ...f.properties, floorLevel: floor.level } }))
    out.walls.features.push(...tag(assets.walls))
    out.frames.features.push(...tag(assets.frames))
    out.panels.features.push(...tag(assets.panels))
    out.glass.features.push(...tag(assets.glass))
    out.stairs.features.push(...tag(assets.stairs))
    // The floor itself: a thin slab over each space its walls enclose, open above stairs rising from inside.
    const walls = floor.walls ?? []
    const faces = walls.length ? deriveRooms(walls.map((w) => ({ id: w.id, sourceWallId: w.id, start: w.start, end: w.end })), []) : []
    faces.forEach((face, i) => {
      const outer = face.polygon.points
      const rings = [outer, ...stairWellHoles(tops, outer).map((hole) => hole.points)]
        .map((ring) => ring.map(toWorld))
      if (rings.some((ring) => ring.some((p) => p === null))) return
      const closed = (rings as [number, number][][]).map((ring) => [...ring, ring[0]])
      out.floors.features.push({ type: 'Feature', id: `${floor.id}:slab:${i}`, properties: { floorLevel: floor.level, base: Math.max(0, base - SLAB_M), height: base }, geometry: { type: 'Polygon', coordinates: closed } })
    })
  }
  // A stair whose top reaches nothing walkable on the floor it climbs to: its top landing in red on that floor.
  for (const stair of building.staircases ?? []) {
    const to = building.floors.find((f) => f.level === stair.toLevel)
    const from = stairFlightFloor(stair)
    const climbs = Object.values(stair.levels ?? {}).some((l) => l?.role === 'top')
    if (!climbs || !to || to.level <= Math.max(from, activeLevel) || hidden.has(to.level) || stairTopReach(building, stair).ok) continue
    const flight = stair.levels[from]
    const top = flight && buildStairTopVolumes([{ id: stair.id, ...flight, rotation: flight.rotation ?? 0, height: stairRise(stair, building.floors), fromLevel: from }], 0).landings.features[0]
    const ring = top?.geometry.coordinates[0].map(([x, y]) => toWorld({ x, y }))
    if (!ring || ring.some((p) => p === null)) continue
    const base = to.elevation - active.elevation
    out.warnings.features.push({ type: 'Feature', id: `${stair.id}:unreached`, properties: { featureId: stair.id, floorLevel: to.level, base, height: base + 0.3 }, geometry: { type: 'Polygon', coordinates: [ring as [number, number][]] } })
  }
  return out
}
