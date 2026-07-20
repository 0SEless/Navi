import type { CommandHandler } from './types'

function noop(id: string): CommandHandler {
  return {
    id,
    execute() {
      return { success: true }
    },
  }
}

export const floorManageHandler = noop('floor.manage')
export const buildingEditInteriorHandler = noop('building.editInterior')
export const buildingAdjustPositionHandler = noop('building.adjustPosition')
export const buildingOpenFloorEditorHandler = noop('building.openFloorEditor')
export const assetUploadHandler = noop('asset.upload')
