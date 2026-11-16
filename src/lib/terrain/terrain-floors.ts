import { deriveRooms } from '@navi/editor/src/geometry/room-derivation'
import { collectFloorDoors, CoordinateTransformer, floorStairInputs, type CampusDocument } from '@navi/core'
import { registerBuildingTransforms } from '@navi/editor'
import { buildFloorArchitectureAssets } from '@/lib/floor-architecture-assets'
import type { FloorArchitectureRenderData } from '@/components/map/NavigationRenderModel'
import { selectFloorArchitecture, type StackedFloorArchitecture } from '@/components/map/layers/FloorArchitectureLayer'

/** The building whose floors the terrain editor shows, and the floor shown on top. */
export interface OpenFloors { buildingId: string; floorId: string }

/**
 * Owner 2026-11-15, "one view": the terrain editor shows the open building's floors exactly as NAVI Web does —
 * the chosen floor standing on every floor below it (walls, door frames, stairs, floor slabs), built with the
 * same pieces (buildFloorArchitectureAssets) and stacked by the same rule (selectFloorArchitecture).
 */
export function terrainFloorStack(document: CampusDocument, open: OpenFloors | null): StackedFloorArchitecture | undefined {
  if (!open) return undefined
  const building = document.buildings.find((b) => b.id === open.buildingId)
  const chosen = building?.floors.find((f) => f.id === open.floorId)
  if (!building || !chosen || (building.footprint?.points?.length ?? 0) < 3) return undefined
  const transformer = new CoordinateTransformer()
  registerBuildingTransforms(transformer, [building], null)
  const records: FloorArchitectureRenderData[] = building.floors.map((floor) => {
    const walls = floor.walls ?? []
    // One rule for which floor draws a stair (2026-11-16): flights on their From floor, only tops on the floor above.
    const { flights: stairs, tops: stairTops } = floorStairInputs(building.staircases ?? [], building.floors, floor.level)
    const faces = walls.length ? deriveRooms(walls.map((w) => ({ id: w.id, sourceWallId: w.id, start: w.start, end: w.end })), []) : []
    const floorFaces = faces
      .map((face) => face.polygon.points.map((p) => transformer.buildingLocalToWorld(p, building.id)).filter((q): q is { lat: number; lng: number } => q !== null))
      .filter((ring) => ring.length >= 3)
    return {
      buildingId: building.id, floor: floor.level, elevation: floor.elevation, floorFaces,
      ...buildFloorArchitectureAssets({
        buildingId: building.id, transformer, walls, openings: floor.openings ?? [], doors: collectFloorDoors(floor),
        windows: floor.windows ?? [], stairs, stairTops, base: floor.elevation,
      }),
    } as FloorArchitectureRenderData
  })
  return selectFloorArchitecture(records, { active: true, buildingId: building.id }, chosen.level, true)
}
