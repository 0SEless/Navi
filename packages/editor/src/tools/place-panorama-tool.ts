import type { Tool, ToolPointerEvent, ToolContext } from './types'
import type { ToolRegistry } from './registry'
import type { CommandDispatcher } from '../commands'

function getDispatcher(ctx: ToolContext): CommandDispatcher | undefined {
  return ctx.getService<CommandDispatcher>('dispatcher')
}

function getRegistry(ctx: ToolContext): ToolRegistry | undefined {
  return ctx.getService<ToolRegistry>('toolRegistry')
}

export const placePanoramaTool: Tool = {
  id: 'place-panorama',
  label: 'Place Panorama',
  cursor: 'crosshair',

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    const dispatcher = getDispatcher(ctx)
    if (!dispatcher) return

    dispatcher.execute({
      id: 'panorama.create',
      label: 'Create Panorama',
      payload: {
        label: 'Panorama',
        position: { lat: event.lat, lng: event.lng },
        heading: 0,
        imageAssetId: '',
        buildingId: '',
        floor: 0,
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
