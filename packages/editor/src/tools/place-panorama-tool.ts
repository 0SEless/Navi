import type { Tool, ToolPointerEvent, ToolContext } from './types'

export const placePanoramaTool: Tool = {
  id: 'place-panorama',
  label: 'Place Panorama',
  cursor: 'crosshair',

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    ctx.services.dispatcher.execute({
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

    ctx.services.toolRegistry?.activate('select', ctx)
  },

  onKeyDown(event: KeyboardEvent, ctx: ToolContext): void {
    if (event.key === 'Escape') {
      ctx.services.toolRegistry?.activate('select', ctx)
    }
  },
}
