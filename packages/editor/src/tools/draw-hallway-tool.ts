import type { Tool, ToolPointerEvent, ToolContext } from './types'

let active = false
let vertices: { x: number; y: number }[] = []
let currentBuildingId = ''
let currentFloorId = ''

export const drawHallwayTool: Tool = {
  id: 'draw-hallway',
  label: 'Draw Hallway',
  cursor: 'crosshair',

  onActivate(ctx: ToolContext): void {
    active = true
    vertices = []
    currentBuildingId = (ctx as Record<string, unknown>).buildingId as string || ''
    currentFloorId = (ctx as Record<string, unknown>).floorId as string || ''
  },

  onDeactivate(_ctx: ToolContext): void {
    active = false
    vertices = []
    currentBuildingId = ''
    currentFloorId = ''
  },

  onPointerDown(event: ToolPointerEvent, _ctx: ToolContext): void {
    if (!active) return
    vertices.push({ x: event.x, y: event.y })
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
  if (!currentBuildingId || !currentFloorId) return
  const dispatcher = ctx.services.dispatcher

  const id = `hw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  dispatcher.execute({
    id: 'hallway.create',
    label: 'Create Hallway',
    payload: {
      id,
      buildingId: currentBuildingId,
      floorId: currentFloorId,
      name: 'Hallway',
      points: vertices.map(v => ({ x: v.x, y: v.y })),
      width: 3,
    },
  })
  vertices = []
}

function cancel(): void {
  vertices = []
}
