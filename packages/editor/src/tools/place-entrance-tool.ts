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

export const placeEntranceTool: Tool = {
  id: 'place-entrance',
  label: 'Place Entrance',
  cursor: 'crosshair',

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    const dispatcher = getDispatcher(ctx)
    if (!dispatcher) return

    const { buildingId, floorId } = getFloorContext(ctx)

    dispatcher.execute({
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

    getRegistry(ctx)?.activate('select', ctx)
  },

  onKeyDown(event: KeyboardEvent, ctx: ToolContext): void {
    if (event.key === 'Escape') {
      getRegistry(ctx)?.activate('select', ctx)
    }
  },
}
