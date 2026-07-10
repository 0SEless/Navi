import type { Tool, ToolPointerEvent, ToolContext } from './types'

function getFloorContext(ctx: ToolContext): { buildingId: string; floorId: string } {
  const viewport = ctx.services?.viewport
  return {
    buildingId: viewport?.activeBuildingId ?? '',
    floorId: viewport?.activeFloorId ?? '',
  }
}

export const placeStaircaseTool: Tool = {
  id: 'place-staircase',
  label: 'Place Staircase',
  cursor: 'crosshair',

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    const { buildingId, floorId } = getFloorContext(ctx)

    ctx.services.dispatcher.execute({
      id: 'staircase.create',
      label: 'Create Staircase',
      payload: {
        buildingId,
        floorId,
        name: 'Staircase',
        position: { x: event.lng, y: event.lat },
        type: 'enclosed',
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
