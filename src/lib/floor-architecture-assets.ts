import { buildWallOpeningVolumes, buildWindowAssetVolumes, buildDoorAssetVolumes, buildStairAssetVolumes, buildOpeningPlanSymbols, type CoordinateTransformer, type StairAssetInput } from '@navi/core'

type Polygons = GeoJSON.FeatureCollection<GeoJSON.Polygon>
export interface FloorArchitectureAssets {
  walls: Polygons
  frames: Polygons
  panels: Polygons
  glass: Polygons
  stairs: Polygons
  /** 2D plan symbols (doors, windows) in world coordinates; decorative only. */
  symbols: { lines: GeoJSON.FeatureCollection<GeoJSON.LineString>; markers: GeoJSON.FeatureCollection<GeoJSON.Point> }
  diagnostics: { entityId: string; code: string; message: string }[]
  modeledIds: { walls: string[]; doors: string[]; openings: string[]; stairs: string[] }
}
export interface FloorArchitectureAssetInput {
  walls: Parameters<typeof buildWallOpeningVolumes>[0]
  openings: Parameters<typeof buildWallOpeningVolumes>[1]
  doors: Parameters<typeof buildDoorAssetVolumes>[2]
  windows?: Parameters<typeof buildWallOpeningVolumes>[3]
  stairs: readonly StairAssetInput[]
  transformer: Pick<CoordinateTransformer, 'buildingLocalToWorld'>
  buildingId: string
  base?: number
}

/** Generate physical solids in local meters, then project every vertex exactly once. */
export function buildFloorArchitectureAssets(input: FloorArchitectureAssetInput): FloorArchitectureAssets {
  const { walls, openings, doors, stairs, transformer, buildingId, base = 0 } = input
  const wall = buildWallOpeningVolumes(walls, openings, doors, input.windows ?? [], base)
  const door = buildDoorAssetVolumes(walls, openings, doors, base)
  const window = buildWindowAssetVolumes(walls, openings, base)
  const stair = buildStairAssetVolumes(stairs, base)
  const plan = buildOpeningPlanSymbols(walls, openings, doors)
  const diagnostics = [...wall.diagnostics, ...door.diagnostics, ...stair.diagnostics]
  const project = (collection: Polygons): Polygons => ({ type: 'FeatureCollection', features: collection.features.flatMap(feature => {
    const coordinates = feature.geometry.coordinates.map(ring => ring.map(([x, y]) => {
      const point = transformer.buildingLocalToWorld({ x, y }, buildingId)
      return point && Number.isFinite(point.lng) && Number.isFinite(point.lat) ? [point.lng, point.lat] : null
    }))
    if (coordinates.some(ring => ring.some(point => point === null))) {
      diagnostics.push({ entityId: String(feature.properties?.wallId ?? feature.properties?.doorId ?? feature.properties?.featureId ?? feature.id), code: 'PROJECTION_INVALID', message: 'Asset has no finite building-world projection; preserve its legacy fallback.' })
      return []
    }
    return [{ ...feature, geometry: { type: 'Polygon' as const, coordinates: coordinates as number[][][] } }]
  }) })
  const toWorld = ([x, y]: number[]) => { const point = transformer.buildingLocalToWorld({ x, y }, buildingId); return point && Number.isFinite(point.lng) && Number.isFinite(point.lat) ? [point.lng, point.lat] : null }
  const symbols = {
    lines: { type: 'FeatureCollection' as const, features: plan.lines.features.flatMap(feature => { const c = feature.geometry.coordinates.map(toWorld); return c.some(p => p === null) ? [] : [{ ...feature, geometry: { type: 'LineString' as const, coordinates: c as number[][] } }] }) },
    markers: { type: 'FeatureCollection' as const, features: plan.markers.features.flatMap(feature => { const c = toWorld(feature.geometry.coordinates); return c ? [{ ...feature, geometry: { type: 'Point' as const, coordinates: c } }] : [] }) },
  }
  const result = {
    walls: project(wall.collection), frames: project({ type: 'FeatureCollection', features: [...door.frames.features, ...window.frames.features] }),
    panels: project(door.panels), glass: project({ type: 'FeatureCollection', features: [...door.glass.features, ...window.glass.features] }), stairs: project(stair.collection), symbols, diagnostics,
  }
  const ids = (collections: Polygons[], key: string) => [...new Set(collections.flatMap(c => c.features.flatMap(f => typeof f.properties?.[key] === 'string' ? [f.properties[key] as string] : [])))]
  const handledWalls = ids([result.walls], 'wallId')
  const localWallIds = new Set(ids([wall.collection], 'wallId'))
  // A full aperture legitimately leaves no wall pieces. Validate the uncut
  // envelope through the same core rules and world projection, but do not emit
  // that envelope: restoring its legacy solid would close the actual opening.
  for (const candidate of walls) {
    if (localWallIds.has(candidate.id) || wall.diagnostics.some(diagnostic => diagnostic.entityId === candidate.id)) continue
    const envelope = buildWallOpeningVolumes([candidate], [], [], [], base)
    if (envelope.diagnostics.length || envelope.collection.features.length === 0) continue
    const projected = project(envelope.collection)
    const valid = projected.features.some(feature => {
      const [a, b, c] = feature.geometry.coordinates[0]
      return a && b && c && Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > 0
    })
    if (valid) handledWalls.push(candidate.id)
  }
  return { ...result, modeledIds: { walls: handledWalls, doors: ids([result.frames, result.panels, result.glass], 'doorId'), openings: ids([result.frames, result.panels, result.glass], 'openingId'), stairs: ids([result.stairs], 'featureId') } }
}
