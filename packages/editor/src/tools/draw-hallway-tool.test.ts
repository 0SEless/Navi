import { describe, it, expect, vi } from 'vitest'
import { drawHallwayTool } from './draw-hallway-tool'
import type { ToolContext, ToolPointerEvent } from './types'

function createCtx(buildingId = 'bld-1', floorId = 'flr-1'): ToolContext {
  const dispatch = vi.fn()
  return {
    services: { dispatcher: { execute: dispatch } } as any,
    buildingId,
    floorId,
  } as ToolContext
}

function makeEvent(x: number, y: number): ToolPointerEvent {
  return { x, y, lng: 0, lat: 0, button: 0, shiftKey: false, ctrlKey: false, altKey: false }
}

function makeKeyEvent(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key })
}

describe('drawHallwayTool', () => {
  it('has correct id, label, and cursor', () => {
    expect(drawHallwayTool.id).toBe('draw-hallway')
    expect(drawHallwayTool.label).toBe('Draw Hallway')
    expect(drawHallwayTool.cursor).toBe('crosshair')
  })

  it('enters active state on activate', () => {
    const ctx = createCtx()
    drawHallwayTool.onActivate?.(ctx)
    drawHallwayTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawHallwayTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawHallwayTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.services.dispatcher
    expect(dispatch.execute).toHaveBeenCalledTimes(1)
  })

  it('onPointerDown adds vertex and Enter dispatches command', () => {
    const ctx = createCtx()
    drawHallwayTool.onActivate?.(ctx)
    drawHallwayTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawHallwayTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawHallwayTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.services.dispatcher
    expect(dispatch.execute).toHaveBeenCalledTimes(1)
    const cmd = dispatch.execute.mock.calls[0][0]
    expect(cmd.id).toBe('hallway.create')
    expect(cmd.payload.points).toHaveLength(2)
    expect(cmd.payload.buildingId).toBe('bld-1')
    expect(cmd.payload.floorId).toBe('flr-1')
    expect(cmd.payload.width).toBe(3)
  })

  it('Escape key cancels and clears vertices', () => {
    const ctx = createCtx()
    drawHallwayTool.onActivate?.(ctx)
    drawHallwayTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawHallwayTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawHallwayTool.onKeyDown?.(makeKeyEvent('Escape'), ctx)
    drawHallwayTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.services.dispatcher
    expect(dispatch.execute).not.toHaveBeenCalled()
  })

  it('Backspace removes last vertex', () => {
    const ctx = createCtx()
    drawHallwayTool.onActivate?.(ctx)
    drawHallwayTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawHallwayTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawHallwayTool.onKeyDown?.(makeKeyEvent('Backspace'), ctx)
    drawHallwayTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.services.dispatcher
    expect(dispatch.execute).not.toHaveBeenCalled()
  })

  it('finish fails gracefully with too few vertices', () => {
    const ctx = createCtx()
    drawHallwayTool.onActivate?.(ctx)
    drawHallwayTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawHallwayTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.services.dispatcher
    expect(dispatch.execute).not.toHaveBeenCalled()
  })
})
