import type { Tool, ToolPointerEvent, ToolContext } from './types'

let active = false
let vertices: { lat: number; lng: number }[] = []

export const drawRoadTool: Tool = {
  id: 'draw-road',
  label: 'Draw Road',
  cursor: 'crosshair',

  onActivate(_ctx: ToolContext): void {
    active = true
    vertices = []
  },

  onDeactivate(_ctx: ToolContext): void {
    active = false
    vertices = []
  },

  onPointerDown(event: ToolPointerEvent, _ctx: ToolContext): void {
    if (!active) return
    vertices.push({ lat: event.lat, lng: event.lng })
  },

  onKeyDown(event: KeyboardEvent, ctx: ToolContext): void {
    if (!active) return
    if (event.key === 'Enter') {
      finish(ctx)
    } else if (event.key === 'Escape') {
      cancel()
    } else if (event.key === 'Backspace') {
      vertices.pop()
    }
  },
}

function finish(ctx: ToolContext): void {
  if (vertices.length < 2) return
  const dispatcher = ctx.services.dispatcher

  const id = `rd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  dispatcher.execute({
    id: 'road.create',
    label: 'Create Road',
    payload: {
      id,
      name: 'Road',
      points: vertices.map(v => ({ lat: v.lat, lng: v.lng })),
      width: 5,
      surface: 'paved',
      type: 'service',
    },
  })
  vertices = []
}

function cancel(): void {
  vertices = []
}
