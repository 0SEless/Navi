import type { Tool, ToolPointerEvent, ToolContext } from './types'

export const placeQrTool: Tool = {
  id: 'place-qr',
  label: 'Place QR Code',
  cursor: 'crosshair',

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    ctx.services.dispatcher.execute({
      id: 'qr.create',
      label: 'Create QR Checkpoint',
      payload: {
        label: 'QR',
        position: { lat: event.lat, lng: event.lng },
        code: 'qr-' + Date.now(),
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
