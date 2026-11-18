import { collectFloorDoors, buildDoorAssetVolumes, buildStairAssetVolumes, floorStairInputs } from '@navi/core'
import type { CoordinateTransformer, Floor, Staircase } from '@navi/core'
import { buildFloorArchitectureAssets } from '@/lib/floor-architecture-assets'

/** Active-floor presentation uses z=0; stacking elevation belongs to multi-floor views. */
export function buildFloorArchitecturePreview(floor: Floor, buildingId: string, transformer: Pick<CoordinateTransformer, 'buildingLocalToWorld'>, staircases: readonly Staircase[] = [], floors: readonly Floor[] = [floor]) {
  // One rule for which floor draws a stair (2026-11-16): flights on their From floor, only tops on the floor above.
  const buildingFloors = floors.some(f => f.level === floor.level) ? floors : [...floors, floor]
  const { flights: stairs, tops } = floorStairInputs(staircases, buildingFloors, floor.level)
  const assets = buildFloorArchitectureAssets({ walls: floor.walls ?? [], openings: floor.openings ?? [], doors: collectFloorDoors(floor), windows: floor.windows ?? [], stairs, stairTops: tops, showIncoming: () => true, floorAreas: floor.rooms?.map(room => room.polygon.points), transformer, buildingId, base: 0 })
  const doors = buildDoorAssetVolumes(floor.walls ?? [], floor.openings ?? [], collectFloorDoors(floor), 0)
  const selectionVolumes: GeoJSON.FeatureCollection<GeoJSON.Polygon> = { type: 'FeatureCollection', features: [...doors.frames.features, ...doors.panels.features, ...doors.glass.features, ...buildStairAssetVolumes(stairs, 0).collection.features] }
  return { ...assets, collection: assets.walls, selectionVolumes }
}
