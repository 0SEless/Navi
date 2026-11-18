import { enclosedFloorAreas, stairWellGuardSegments } from './stair-well-guards'
import { buildPlatformGuardVolumes, integratedStairVolumes, stairLandingGuardSegments, buildWallOpeningVolumes, buildWindowAssetVolumes, buildDoorAssetVolumes, buildStairAssetVolumes, buildStairTopVolumes, stairTopShape, buildOpeningPlanSymbols, floorStairMesh, toLocal, type CoordinateTransformer, type StairAssetInput, type StairTopInput, type LocalCoord } from '@navi/core'

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
  /**
   * Smooth stairs (2026-11-16): this floor's stair flights as one triangle mesh (local metres east/north around
   * `origin`, absolute heights), for a MapLibre mesh layer. The stepped `stairs` solids stay as click targets; only
   * stair tops (features with `fromLevel`) are still drawn as blocks. Null when the floor has no buildable stair.
   */
  stairWells?: number[][][]
  stairMesh: { origin: { lat: number; lng: number }; mesh: Float32Array } | null
}
export interface FloorArchitectureAssetInput {
  walls: Parameters<typeof buildWallOpeningVolumes>[0]
  openings: Parameters<typeof buildWallOpeningVolumes>[1]
  doors: Parameters<typeof buildDoorAssetVolumes>[2]
  windows?: Parameters<typeof buildWallOpeningVolumes>[3]
  stairs: readonly StairAssetInput[]
  /** Stairs arriving on this floor from below (2026-11-16): drawn as a top landing and a stairwell outline. */
  stairTops?: readonly StairTopInput[]
  /** Arrival flights whose source geometry is outside this view. */
  showIncoming?: (top: StairTopInput) => boolean
  floorAreas?: LocalCoord[][]
  transformer: Pick<CoordinateTransformer, 'buildingLocalToWorld'>
  buildingId: string
  base?: number
  /**
   * Outlines (building-local) of stairs climbing up through this floor from below that have no top here
   * (stairWellsFromBelow): the floor is open over them, drawn and cut like a stair top's stairwell.
   */
  wellsFromBelow?: ReadonlyArray<ReadonlyArray<XY>>
  /** Height of the ground under the building, same frame as `base` (default `base`): outside stairs fill down to it. */
  ground?: number
}

type XY = { x: number; y: number }
/** Walls on all four sides of a point (building-local): it is inside the building, not outside its walls. */
function surroundedByWalls(p: XY, walls: readonly { start: XY; end: XY }[]): boolean {
  const hit = (dx: number, dy: number) => walls.some(({ start: a, end: b }) => {
    const ex = b.x - a.x, ey = b.y - a.y, den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-12) return false
    const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den, u = ((a.x - p.x) * dy - (a.y - p.y) * dx) / den
    return t > 0 && u >= 0 && u <= 1
  })
  return hit(1, 0) && hit(-1, 0) && hit(0, 1) && hit(0, -1)
}
const stairCentre = (s: StairAssetInput): XY => {
  const pts = s.polygon?.points
  return pts && pts.length >= 3 ? { x: pts.reduce((n, q) => n + q.x, 0) / pts.length, y: pts.reduce((n, q) => n + q.y, 0) / pts.length } : s.position
}

type WellFloor = { level: number; elevation: number; height?: number; staircases: ReadonlyArray<{ id: string; role?: string; height?: number; polygon?: { points: ReadonlyArray<XY> } }> }
/**
 * Stairs that climb up through floor `level` from a floor below it, as building-local outlines (owner 2026-11-18:
 * white floor pieces over the Computer Science stair). A stair drawn with the Stair tool has no To floor and so no
 * top on the floor it reaches; its outline opens that floor instead. A stair with a top there already has a stairwell.
 */
export function stairWellsFromBelow(floors: readonly WellFloor[], level: number): Array<ReadonlyArray<XY>> {
  const here = floors.find((f) => f.level === level)
  if (!here || !Number.isFinite(here.elevation)) return []
  const topped = new Set(here.staircases.filter((s) => s.role === 'top').map((s) => s.id))
  return floors.flatMap((f) => {
    if (!Number.isFinite(f.elevation) || f.elevation >= here.elevation) return []
    return f.staircases.flatMap((s) => {
      const rise = s.height ?? f.height
      const pts = s.polygon?.points
      if (s.role === 'top' || topped.has(s.id) || !pts || pts.length < 3 || rise === undefined) return []
      return f.elevation + rise >= here.elevation - 0.05 ? [pts] : []
    })
  })
}

/** Generate physical solids in local meters, then project every vertex exactly once. */
export function buildFloorArchitectureAssets(input: FloorArchitectureAssetInput): FloorArchitectureAssets {
  const { walls, openings, doors, stairs, transformer, buildingId, base = 0 } = input
  const wall = buildWallOpeningVolumes(walls, openings, doors, input.windows ?? [], base)
  const door = buildDoorAssetVolumes(walls, openings, doors, base)
  const window = buildWindowAssetVolumes(walls, openings, base)
  const stairAll = buildStairAssetVolumes(stairs, base)
  // Stair sides (2026-11-16): parapets and rails are drawn smooth by the stair mesh (floorStairMesh), never as
  // stepped blocks; the steps stay here as the stair's solids (click targets, fallback drawing).
  const stair = { ...stairAll, collection: { type: 'FeatureCollection' as const, features: stairAll.collection.features.filter(f => f.properties?.partType !== 'parapet' && f.properties?.partType !== 'rail') } }
  const integrated = new Map(stairs.flatMap(input => {
    const volumes = integratedStairVolumes(input, base)
    return volumes ? [[input.id, volumes] as const] : []
  }))
  if (integrated.size) {
    stair.collection.features = stair.collection.features.filter(feature => !integrated.has(String(feature.properties?.featureId)))
    stair.collection.features.push(...[...integrated.values()].flat())
  }
  const tops = buildStairTopVolumes(input.stairTops ?? [], base)
  const floorAreas = input.stairTops?.length ? [...enclosedFloorAreas(walls), ...(input.floorAreas ?? [])] : []
  const shapes = (input.stairTops ?? []).flatMap(top => {
    const shape = stairTopShape(top)
    return shape ? [{ top, shape }] : []
  })
  const ownedLandings = new Set(shapes.filter(({ top }) => input.showIncoming &&
    top.drawing?.properties.preset === 'straight' && (top.drawing.properties.topLandingM ?? 0) > 0).map(({ top }) => top.id))
  stair.collection.features.push(...tops.landings.features.filter(feature => !ownedLandings.has(String(feature.properties?.featureId))))
  for (const { top, shape } of shapes) {
    const ring = shape.landing
    const landingHeight = shape.integrated || ownedLandings.has(top.id) ? base : Number(tops.landings.features.find(f => f.id === `${top.id}:top`)?.properties?.height)
    const picked = top.drawing?.properties.railingStyle ?? top.look?.railingStyle
      ?? (top.drawing?.properties.sides === 'wall' ? 'wall' : 'half-wall')
    const style = picked === 'half-wall' || picked === 'wall' ? picked : 'posts-rails'
    const guardRuns = stairLandingGuardSegments(ring, top).map(segment => ({ ...segment, kind: 'top' }))
    if (top.drawing?.properties.preset !== 'ushape') {
      const otherWells = shapes.filter(other => other.top.id !== top.id).map(other => other.shape.well)
      guardRuns.push(...stairWellGuardSegments(shape.well, floorAreas, walls, otherWells, wallId => [
        ...openings.filter(o => o.wallId === wallId && o.type === 'door' && (o.sillHeight ?? 0) <= 0.05)
          .map(o => ({ start: o.offset, end: o.offset + o.width })),
        ...doors.flatMap(door => door.wallAttachment?.wallId === wallId
          ? [{ start: door.wallAttachment.offset - door.width / 2, end: door.wallAttachment.offset + door.width / 2 }] : []),
      ])
        .map(segment => ({ ...segment, kind: 'well' })))
    }
    for (const { edge, index, from, to, kind } of guardRuns) {
      const guards = buildPlatformGuardVolumes(style, {
        id: `${top.id}:${kind}-guard:${edge}:${index}`, from, to,
        base: kind === 'well' ? base : landingHeight, thickness: 0.12,
      })
      for (const guard of guards) {
        guard.properties = { ...guard.properties, featureId: top.id, fromLevel: top.fromLevel, partType: kind === 'top' ? 'landing-guard' : 'well-guard' }
      }
      stair.collection.features.push(...guards)
    }
  }
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
    lines: { type: 'FeatureCollection' as const, features: [...plan.lines.features, ...tops.wells.features.map(well => ({ type: 'Feature' as const, id: well.id, properties: { ...well.properties, kind: 'stairwell' }, geometry: { type: 'LineString' as const, coordinates: well.geometry.coordinates[0] } })), ...(input.wellsFromBelow ?? []).map((pts, i) => ({ type: 'Feature' as const, id: `well-from-below-${i}`, properties: { kind: 'stairwell' }, geometry: { type: 'LineString' as const, coordinates: [...pts, pts[0]].map((p) => [p.x, p.y]) } }))].flatMap(feature => { const c = feature.geometry.coordinates.map(toWorld); return c.some(p => p === null) ? [] : [{ ...feature, geometry: { type: 'LineString' as const, coordinates: c as number[][] } }] }) },
    markers: { type: 'FeatureCollection' as const, features: plan.markers.features.flatMap(feature => { const c = toWorld(feature.geometry.coordinates); return c ? [{ ...feature, geometry: { type: 'Point' as const, coordinates: c } }] : [] }) },
  }
  const incoming = shapes.filter(({ top, shape }) => (shape.integrated || top.drawing?.properties.preset !== 'ushape') && input.showIncoming?.(top))
  for (const { top } of incoming) {
    const sourceBase = base - (top.height ?? 0)
    const blocks = integratedStairVolumes({ ...top, arrivalLanding: true }, sourceBase)
    const fallback = blocks ?? buildStairAssetVolumes([top], sourceBase).collection.features.filter(feature =>
      feature.properties?.partType !== 'parapet' && feature.properties?.partType !== 'rail')
    stair.collection.features.push(...fallback)
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
  const origin = stairs.length > 0 || incoming.length > 0 ? transformer.buildingLocalToWorld({ x: 0, y: 0 }, buildingId) : null
  const grid = origin ? { originLat: origin.lat, originLng: origin.lng } : null
  // The smooth mesh is decoration: if it cannot be built, the stair blocks are drawn instead.
  let mesh: Float32Array | null = null
  try {
    // A stair outside the floor's walls is filled down to the ground, not just to its floor (2026-11-17).
    const placed = walls.length ? stairs.map((s) => (surroundedByWalls(stairCentre(s), walls) ? s : { ...s, outside: true })) : stairs
    if (origin && grid) {
      const place = (p: XY) => {
        const world = transformer.buildingLocalToWorld(p, buildingId)
        return world ? toLocal(grid, world) : { x: NaN, y: NaN }
      }
      const parts = [floorStairMesh(placed, base, place, input.ground ?? base)]
      for (const { top } of incoming) {
        const sourceBase = base - (top.height ?? 0)
        parts.push(floorStairMesh([{ ...top, arrivalLanding: true, groundLanding: false }], sourceBase, place))
      }
      mesh = new Float32Array(parts.reduce((total, part) => total + part.length, 0))
      let offset = 0
      for (const part of parts) {
        mesh.set(part, offset)
        offset += part.length
      }
    }
  } catch { mesh = null }
  const stairMesh = origin && mesh && mesh.length > 0 && mesh.every(Number.isFinite) ? { origin: { lat: origin.lat, lng: origin.lng }, mesh } : null
  const stairWells = symbols.lines.features.filter(feature => feature.properties?.kind === 'stairwell').map(feature => feature.geometry.coordinates)
  return { ...result, stairMesh, stairWells, modeledIds: { walls: handledWalls, doors: ids([result.frames, result.panels, result.glass], 'doorId'), openings: ids([result.frames, result.panels, result.glass], 'openingId'), stairs: ids([result.stairs], 'featureId') } }
}
