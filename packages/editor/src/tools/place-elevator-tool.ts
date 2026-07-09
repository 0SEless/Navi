import type { Tool, ToolPointerEvent, ToolContext } from './types'
import type { ToolRegistry } from './registry'
import type { CommandDispatcher } from '../commands'

function getDispatcher(ctx: ToolContext): CommandDispatcher | undefined {
  return ctx.getService<CommandDispatcher>('dispatcher')
}

function getRegistry(ctx: ToolContext): ToolRegistry | undefined {
  return ctx.getService<ToolRegistry>('toolRegistry')
}

function getFloorContext(ctx: ToolContext): { buildingId: string; floorId: string } {
  const viewport = ctx.getService<{ activeBuildingId?: string; activeFloorId?: string }>('viewport')
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
    const dispatcher = getDispatcher(ctx)
    if (!dispatcher) return

    const { buildingId, floorId } = getFloorContext(ctx)

    dispatcher.execute({
      id: 'elevator.create',
      label: 'Create Elevator',
      payload: {
        buildingId,
        floorId,
        name: 'Elevator',
        position: { x: event.lng, y: event.lat },
      },
    })

    getRegistry(ctx)?.activate('select', ctx)
  },

  onKeyDown(event: KeyboardEvent, ctx: ToolContext): void {
    if (event.key === 'Escape') {
      getRegistry(ctx)?.activate('select', ctx)
    }
  },
}
