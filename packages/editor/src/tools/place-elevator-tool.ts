import type { Tool, ToolPointerEvent, ToolContext } from './types'

function getFloorContext(ctx: ToolContext): { buildingId: string; floorId: string } {
  const viewport = ctx.services?.viewport
  return {
    buildingId: viewport?.activeBuildingId ?? '',
    floorId: viewport?.activeFloorId ?? '',
  }
}

export const placeElevatorTool: Tool = {
  id: 'place-elevator',
  label: 'Place Elevator',
  cursor: 'crosshair',

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    const { buildingId, floorId } = getFloorContext(ctx)

    ctx.services.dispatcher.execute({
      id: 'elevator.create',
      label: 'Create Elevator',
      payload: {
        buildingId,
        floorId,
        name: 'Elevator',
        position: { x: event.lng, y: event.lat },
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
