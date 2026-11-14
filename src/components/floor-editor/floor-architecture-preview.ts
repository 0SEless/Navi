import { collectFloorDoors, buildDoorAssetVolumes, buildStairAssetVolumes } from '@navi/core'
import type { CoordinateTransformer, Floor, Staircase } from '@navi/core'
import { buildFloorArchitectureAssets } from '@/lib/floor-architecture-assets'

/** Active-floor presentation uses z=0; stacking elevation belongs to multi-floor views. */
export function buildFloorArchitecturePreview(floor: Floor, buildingId: string, transformer: Pick<CoordinateTransformer, 'buildingLocalToWorld'>, staircases: readonly Staircase[] = []) {
  const stairs = staircases.flatMap(stair => {
    const geometry = stair.levels?.[floor.level]
    const height = geometry?.height ?? floor.height
    return geometry ? [{ id: stair.id, ...geometry, rotation: geometry.rotation ?? 0, ...(height !== undefined ? { height } : {}) }] : []
  })
  const assets = buildFloorArchitectureAssets({ walls: floor.walls ?? [], openings: floor.openings ?? [], doors: collectFloorDoors(floor), windows: floor.windows ?? [], stairs, transformer, buildingId, base: 0 })
  const doors = buildDoorAssetVolumes(floor.walls ?? [], floor.openings ?? [], collectFloorDoors(floor), 0)
  const selectionVolumes: GeoJSON.FeatureCollection<GeoJSON.Polygon> = { type: 'FeatureCollection', features: [...doors.frames.features, ...doors.panels.features, ...doors.glass.features, ...buildStairAssetVolumes(stairs, 0).collection.features] }
  return { ...assets, collection: assets.walls, selectionVolumes }
}
