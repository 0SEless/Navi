import type { Tool, ToolPointerEvent, ToolContext } from './types'

function getFloorContext(ctx: ToolContext): { buildingId: string; floorId: string } {
  const viewport = ctx.services?.viewport
  return {
    buildingId: viewport?.activeBuildingId ?? '',
    floorId: viewport?.activeFloorId ?? '',
  }
}

export const placeEntranceTool: Tool = {
  id: 'place-entrance',
  label: 'Place Entrance',
  cursor: 'crosshair',

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    const { buildingId, floorId } = getFloorContext(ctx)

    ctx.services.dispatcher.execute({
      id: 'entrance.create',
      label: 'Create Entrance',
      payload: {
        buildingId,
        floorId,
        label: 'Entrance',
        position: { lat: event.lat, lng: event.lng },
        type: 'side',
      },
    })

    ctx.services.toolRegistry?.activate('select', ctx)
  },

  onKeyDown(event: KeyboardEvent, ctx: ToolContext): void {
    if (event.key === 'Escape') {
      ctx.services.toolRegistry?.activate('select', ctx)
    }
  },
}
