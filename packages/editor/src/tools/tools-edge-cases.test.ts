import { describe, it, expect, vi } from 'vitest'
import { drawBuildingTool } from './draw-building-tool'
import { drawRoomTool } from './draw-room-tool'
import { drawHallwayTool } from './draw-hallway-tool'
import { drawRoadTool } from './draw-road-tool'
import { placeEntranceTool } from './place-entrance-tool'
import { placeStaircaseTool } from './place-staircase-tool'
import { placeElevatorTool } from './place-elevator-tool'
import { placePanoramaTool } from './place-panorama-tool'
import { placeQrTool } from './place-qr-tool'
import type { ToolPointerEvent, ToolContext } from './types'

function makeEvent(lng: number, lat: number, overrides: Partial<ToolPointerEvent> = {}): ToolPointerEvent {
  return { x: 0, y: 0, lng, lat, button: 0, shiftKey: false, ctrlKey: false, altKey: false, ...overrides }
}

function makeKeyEvent(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key })
}

function makePlacementServices(hasViewport = true) {
  const dispatch = vi.fn()
  const activate = vi.fn()
  const services: Record<string, unknown> = {
    dispatcher: { execute: dispatch },
    toolRegistry: { activate },
  }
  if (hasViewport) {
    services.viewport = { activeBuildingId: 'b1', activeFloorId: 'f1' }
  }
  return { dispatch, activate, services }
}

function makeDrawCtx(): ToolContext {
  const dispatch = vi.fn()
  return { getService: (name: string) => (name === 'dispatcher' ? { execute: dispatch } : undefined) }
}

function makeDrawCtxWithBld(buildingId = 'bld-1', floorId = 'flr-1'): ToolContext {
  const dispatch = vi.fn()
  return {
    getService: (name: string) => (name === 'dispatcher' ? { execute: dispatch } : undefined),
    buildingId,
    floorId,
  } as ToolContext
}

function makePlacementCtx(s: { services: Record<string, unknown> }): ToolContext {
  return { getService: (name: string) => s.services[name] }
}

function getDispatch(ctx: ToolContext): any {
  return ctx.getService<any>('dispatcher')
}

// ========================================================================
// draw-building-tool edge cases
// ========================================================================
describe('drawBuildingTool edge cases', () => {
  it('deactivate during drawing clears state so finish does not dispatch', () => {
    const ctx = makeDrawCtx()
    drawBuildingTool.onActivate?.(ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawBuildingTool.onDeactivate?.(ctx)
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    expect(getDispatch(ctx).execute).not.toHaveBeenCalled()
  })

  it('activate twice in a row resets vertices to fresh state', () => {
    const ctx = makeDrawCtx()
    drawBuildingTool.onActivate?.(ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawBuildingTool.onActivate?.(ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(30, 40), ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(31, 41), ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(32, 42), ctx)
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const cmd = getDispatch(ctx).execute.mock.calls[0][0]
    expect(cmd.payload.footprint.points).toHaveLength(3)
    expect(cmd.payload.footprint.points[0]).toEqual({ lng: 30, lat: 40 })
  })

  it('rapid clicks accumulate 10 vertices in footprint', () => {
    const ctx = makeDrawCtx()
    drawBuildingTool.onActivate?.(ctx)
    for (let i = 0; i < 10; i++) {
      drawBuildingTool.onPointerDown?.(makeEvent(i, i * 2), ctx)
    }
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const cmd = getDispatch(ctx).execute.mock.calls[0][0]
    expect(cmd.payload.footprint.points).toHaveLength(10)
  })

  it('backspace with 0 vertices does not crash', () => {
    const ctx = makeDrawCtx()
    drawBuildingTool.onActivate?.(ctx)
    expect(() => drawBuildingTool.onKeyDown?.(makeKeyEvent('Backspace'), ctx)).not.toThrow()
  })

  it('enter with 0 vertices (never activated) does not dispatch', () => {
    const ctx = makeDrawCtx()
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    expect(getDispatch(ctx).execute).not.toHaveBeenCalled()
  })

  it('escape then enter does not dispatch', () => {
    const ctx = makeDrawCtx()
    drawBuildingTool.onActivate?.(ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(12, 22), ctx)
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Escape'), ctx)
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    expect(getDispatch(ctx).execute).not.toHaveBeenCalled()
  })

  it('escape clears then fresh activate and draw works', () => {
    const ctx = makeDrawCtx()
    drawBuildingTool.onActivate?.(ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Escape'), ctx)
    drawBuildingTool.onActivate?.(ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(50, 60), ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(51, 61), ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(52, 62), ctx)
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    expect(getDispatch(ctx).execute).toHaveBeenCalledTimes(1)
    const cmd = getDispatch(ctx).execute.mock.calls[0][0]
    expect(cmd.payload.footprint.points).toHaveLength(3)
  })

  it('finish with 5 vertices includes all 5 in payload', () => {
    const ctx = makeDrawCtx()
    drawBuildingTool.onActivate?.(ctx)
    for (let i = 0; i < 5; i++) {
      drawBuildingTool.onPointerDown?.(makeEvent(i * 10, i * 10), ctx)
    }
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const cmd = getDispatch(ctx).execute.mock.calls[0][0]
    expect(cmd.payload.footprint.points).toHaveLength(5)
    expect(cmd.id).toBe('building.create')
  })
})

// ========================================================================
// draw-room-tool edge cases
// ========================================================================
describe('drawRoomTool edge cases', () => {
  it('deactivate during drawing clears state so finish does not dispatch', () => {
    const ctx = makeDrawCtxWithBld()
    drawRoomTool.onActivate?.(ctx)
    drawRoomTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawRoomTool.onDeactivate?.(ctx)
    drawRoomTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    expect(getDispatch(ctx).execute).not.toHaveBeenCalled()
  })

  it('activate twice in a row resets and still works', () => {
    const ctx = makeDrawCtxWithBld()
    drawRoomTool.onActivate?.(ctx)
    drawRoomTool.onActivate?.(ctx)
    drawRoomTool.onPointerDown?.(makeEvent(20, 30), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(21, 31), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(22, 32), ctx)
    drawRoomTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const cmd = getDispatch(ctx).execute.mock.calls[0][0]
    expect(cmd.payload.points).toHaveLength(3)
    expect(cmd.id).toBe('room.create')
  })

  it('rapid clicks accumulate 10 vertices', () => {
    const ctx = makeDrawCtxWithBld()
    drawRoomTool.onActivate?.(ctx)
    for (let i = 0; i < 10; i++) {
      drawRoomTool.onPointerDown?.(makeEvent(i, i), ctx)
    }
    drawRoomTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const cmd = getDispatch(ctx).execute.mock.calls[0][0]
    expect(cmd.payload.points).toHaveLength(10)
  })

  it('backspace with 0 vertices does not crash', () => {
    const ctx = makeDrawCtxWithBld()
    drawRoomTool.onActivate?.(ctx)
    expect(() => drawRoomTool.onKeyDown?.(makeKeyEvent('Backspace'), ctx)).not.toThrow()
  })

  it('finish with missing buildingId does not dispatch', () => {
    const ctx = makeDrawCtx()
    drawRoomTool.onActivate?.(ctx)
    drawRoomTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(12, 22), ctx)
    drawRoomTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    expect(getDispatch(ctx).execute).not.toHaveBeenCalled()
  })
})

// ========================================================================
// draw-hallway-tool edge cases
// ========================================================================
describe('drawHallwayTool edge cases', () => {
  it('deactivate during drawing clears state so finish does not dispatch', () => {
    const ctx = makeDrawCtxWithBld()
    drawHallwayTool.onActivate?.(ctx)
    drawHallwayTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawHallwayTool.onDeactivate?.(ctx)
    drawHallwayTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    expect(getDispatch(ctx).execute).not.toHaveBeenCalled()
  })

  it('rapid clicks accumulate 10 vertices with correct width', () => {
    const ctx = makeDrawCtxWithBld()
    drawHallwayTool.onActivate?.(ctx)
    for (let i = 0; i < 10; i++) {
      drawHallwayTool.onPointerDown?.(makeEvent(i, i), ctx)
    }
    drawHallwayTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const cmd = getDispatch(ctx).execute.mock.calls[0][0]
    expect(cmd.payload.points).toHaveLength(10)
    expect(cmd.payload.width).toBe(3)
  })

  it('backspace with 0 vertices does not crash', () => {
    const ctx = makeDrawCtxWithBld()
    drawHallwayTool.onActivate?.(ctx)
    expect(() => drawHallwayTool.onKeyDown?.(makeKeyEvent('Backspace'), ctx)).not.toThrow()
  })

  it('escape then enter does not dispatch', () => {
    const ctx = makeDrawCtxWithBld()
    drawHallwayTool.onActivate?.(ctx)
    drawHallwayTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawHallwayTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawHallwayTool.onKeyDown?.(makeKeyEvent('Escape'), ctx)
    drawHallwayTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    expect(getDispatch(ctx).execute).not.toHaveBeenCalled()
  })
})

// ========================================================================
// draw-road-tool edge cases
// ========================================================================
describe('drawRoadTool edge cases', () => {
  it('deactivate during drawing clears state so finish does not dispatch', () => {
    const ctx = makeDrawCtx()
    drawRoadTool.onActivate?.(ctx)
    drawRoadTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawRoadTool.onDeactivate?.(ctx)
    drawRoadTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    expect(getDispatch(ctx).execute).not.toHaveBeenCalled()
  })

  it('rapid clicks accumulate 10 vertices with correct defaults', () => {
    const ctx = makeDrawCtx()
    drawRoadTool.onActivate?.(ctx)
    for (let i = 0; i < 10; i++) {
      drawRoadTool.onPointerDown?.(makeEvent(i, i), ctx)
    }
    drawRoadTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const cmd = getDispatch(ctx).execute.mock.calls[0][0]
    expect(cmd.payload.points).toHaveLength(10)
    expect(cmd.payload.width).toBe(5)
    expect(cmd.payload.surface).toBe('paved')
    expect(cmd.payload.type).toBe('service')
  })

  it('backspace with 0 vertices does not crash', () => {
    const ctx = makeDrawCtx()
    drawRoadTool.onActivate?.(ctx)
    expect(() => drawRoadTool.onKeyDown?.(makeKeyEvent('Backspace'), ctx)).not.toThrow()
  })

  it('escape then enter does not dispatch', () => {
    const ctx = makeDrawCtx()
    drawRoadTool.onActivate?.(ctx)
    drawRoadTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawRoadTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawRoadTool.onKeyDown?.(makeKeyEvent('Escape'), ctx)
    drawRoadTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    expect(getDispatch(ctx).execute).not.toHaveBeenCalled()
  })
})

// ========================================================================
// place-entrance-tool edge cases
// ========================================================================
describe('placeEntranceTool edge cases', () => {
  it('multiple rapid placements each dispatch a command', () => {
    const s = makePlacementServices()
    const ctx = makePlacementCtx(s)
    placeEntranceTool.onPointerDown!(makeEvent(10, 20), ctx)
    placeEntranceTool.onPointerDown!(makeEvent(30, 40), ctx)
    expect(s.dispatch).toHaveBeenCalledTimes(2)
  })

  it('missing dispatcher does not throw', () => {
    const ctx: ToolContext = { getService: () => undefined }
    expect(() => placeEntranceTool.onPointerDown!(makeEvent(0, 0), ctx)).not.toThrow()
  })

  it('missing toolRegistry still dispatches without crashing', () => {
    const dispatch = vi.fn()
    const ctx: ToolContext = {
      getService: (name: string) => (name === 'dispatcher' ? { execute: dispatch } : undefined),
    }
    placeEntranceTool.onPointerDown!(makeEvent(10, 20), ctx)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('enter key does nothing', () => {
    const s = makePlacementServices()
    const ctx = makePlacementCtx(s)
    placeEntranceTool.onKeyDown!(makeKeyEvent('Enter'), ctx)
    expect(s.activate).not.toHaveBeenCalled()
  })
})

// ========================================================================
// place-staircase-tool edge cases
// ========================================================================
describe('placeStaircaseTool edge cases', () => {
  it('multiple rapid placements each dispatch a command', () => {
    const s = makePlacementServices()
    const ctx = makePlacementCtx(s)
    placeStaircaseTool.onPointerDown!(makeEvent(10, 20), ctx)
    placeStaircaseTool.onPointerDown!(makeEvent(30, 40), ctx)
    expect(s.dispatch).toHaveBeenCalledTimes(2)
  })

  it('missing dispatcher does not throw', () => {
    const ctx: ToolContext = { getService: () => undefined }
    expect(() => placeStaircaseTool.onPointerDown!(makeEvent(0, 0), ctx)).not.toThrow()
  })

  it('enter key does nothing', () => {
    const s = makePlacementServices()
    const ctx = makePlacementCtx(s)
    placeStaircaseTool.onKeyDown!(makeKeyEvent('Enter'), ctx)
    expect(s.activate).not.toHaveBeenCalled()
  })
})

// ========================================================================
// place-elevator-tool edge cases
// ========================================================================
describe('placeElevatorTool edge cases', () => {
  it('multiple rapid placements each dispatch a command', () => {
    const s = makePlacementServices()
    const ctx = makePlacementCtx(s)
    placeElevatorTool.onPointerDown!(makeEvent(10, 20), ctx)
    placeElevatorTool.onPointerDown!(makeEvent(30, 40), ctx)
    expect(s.dispatch).toHaveBeenCalledTimes(2)
  })

  it('missing dispatcher does not throw', () => {
    const ctx: ToolContext = { getService: () => undefined }
    expect(() => placeElevatorTool.onPointerDown!(makeEvent(0, 0), ctx)).not.toThrow()
  })

  it('enter key does nothing', () => {
    const s = makePlacementServices()
    const ctx = makePlacementCtx(s)
    placeElevatorTool.onKeyDown!(makeKeyEvent('Enter'), ctx)
    expect(s.activate).not.toHaveBeenCalled()
  })
})

// ========================================================================
// place-panorama-tool edge cases
// ========================================================================
describe('placePanoramaTool edge cases', () => {
  it('multiple rapid placements each dispatch a command', () => {
    const s = makePlacementServices()
    const ctx = makePlacementCtx(s)
    placePanoramaTool.onPointerDown!(makeEvent(10, 20), ctx)
    placePanoramaTool.onPointerDown!(makeEvent(30, 40), ctx)
    expect(s.dispatch).toHaveBeenCalledTimes(2)
  })

  it('missing toolRegistry still dispatches without crashing', () => {
    const dispatch = vi.fn()
    const ctx: ToolContext = {
      getService: (name: string) => (name === 'dispatcher' ? { execute: dispatch } : undefined),
    }
    placePanoramaTool.onPointerDown!(makeEvent(10, 20), ctx)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('enter key does nothing', () => {
    const s = makePlacementServices()
    const ctx = makePlacementCtx(s)
    placePanoramaTool.onKeyDown!(makeKeyEvent('Enter'), ctx)
    expect(s.activate).not.toHaveBeenCalled()
  })
})

// ========================================================================
// place-qr-tool edge cases
// ========================================================================
describe('placeQrTool edge cases', () => {
  it('multiple rapid placements each dispatch a command', () => {
    const s = makePlacementServices()
    const ctx = makePlacementCtx(s)
    placeQrTool.onPointerDown!(makeEvent(10, 20), ctx)
    placeQrTool.onPointerDown!(makeEvent(30, 40), ctx)
    expect(s.dispatch).toHaveBeenCalledTimes(2)
  })

  it('missing toolRegistry still dispatches without crashing', () => {
    const dispatch = vi.fn()
    const ctx: ToolContext = {
      getService: (name: string) => (name === 'dispatcher' ? { execute: dispatch } : undefined),
    }
    placeQrTool.onPointerDown!(makeEvent(10, 20), ctx)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('enter key does nothing', () => {
    const s = makePlacementServices()
    const ctx = makePlacementCtx(s)
    placeQrTool.onKeyDown!(makeKeyEvent('Enter'), ctx)
    expect(s.activate).not.toHaveBeenCalled()
  })
})
