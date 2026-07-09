import type { Tool, ToolPointerEvent, ToolContext } from './types'
import type { CommandDispatcher } from '../commands'

let active = false
let vertices: { lng: number; lat: number }[] = []

export const drawBuildingTool: Tool = {
  id: 'draw-building',
  label: 'Draw Building',
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
    vertices.push({ lng: event.lng, lat: event.lat })
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
  if (vertices.length < 3) return
  const dispatcher = ctx.getService<CommandDispatcher>('dispatcher')
  if (!dispatcher) return

  const id = `bld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  dispatcher.execute({
    id: 'building.create',
    label: 'Create Building',
    payload: {
      id,
      name: `Building${vertices.length}`,
      code: '',
      category: 'academic',
      height: 20,
      color: '#4A90D9',
      footprint: {
        points: vertices.map(v => ({ lng: v.lng, lat: v.lat })),
      },
    },
  })
  vertices = []
}

function cancel(): void {
  vertices = []
}
