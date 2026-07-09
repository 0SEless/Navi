import { describe, it, expect, vi } from 'vitest'
import { drawRoomTool } from './draw-room-tool'
import type { ToolContext, ToolPointerEvent } from './types'

function createCtx(buildingId = 'bld-1', floorId = 'flr-1'): ToolContext {
  const dispatch = vi.fn()
  return {
    getService: (name: string) => name === 'dispatcher' ? { execute: dispatch } : undefined,
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

describe('drawRoomTool', () => {
  it('has correct id, label, and cursor', () => {
    expect(drawRoomTool.id).toBe('draw-room')
    expect(drawRoomTool.label).toBe('Draw Room')
    expect(drawRoomTool.cursor).toBe('crosshair')
  })

  it('enters active state on activate', () => {
    const ctx = createCtx()
    drawRoomTool.onActivate?.(ctx)
    drawRoomTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(12, 22), ctx)
    drawRoomTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.getService<any>('dispatcher')
    expect(dispatch.execute).toHaveBeenCalledTimes(1)
  })

  it('onPointerDown adds vertex and Enter dispatches command', () => {
    const ctx = createCtx()
    drawRoomTool.onActivate?.(ctx)
    drawRoomTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(12, 22), ctx)
    drawRoomTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.getService<any>('dispatcher')
    expect(dispatch.execute).toHaveBeenCalledTimes(1)
    const cmd = dispatch.execute.mock.calls[0][0]
    expect(cmd.id).toBe('room.create')
    expect(cmd.payload.points).toHaveLength(3)
    expect(cmd.payload.buildingId).toBe('bld-1')
    expect(cmd.payload.floorId).toBe('flr-1')
  })

  it('Escape key cancels and clears vertices', () => {
    const ctx = createCtx()
    drawRoomTool.onActivate?.(ctx)
    drawRoomTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(12, 22), ctx)
    drawRoomTool.onKeyDown?.(makeKeyEvent('Escape'), ctx)
    drawRoomTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.getService<any>('dispatcher')
    expect(dispatch.execute).not.toHaveBeenCalled()
  })

  it('Backspace removes last vertex', () => {
    const ctx = createCtx()
    drawRoomTool.onActivate?.(ctx)
    drawRoomTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(12, 22), ctx)
    drawRoomTool.onKeyDown?.(makeKeyEvent('Backspace'), ctx)
    drawRoomTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.getService<any>('dispatcher')
    expect(dispatch.execute).not.toHaveBeenCalled()
  })

  it('finish fails gracefully with too few vertices', () => {
    const ctx = createCtx()
    drawRoomTool.onActivate?.(ctx)
    drawRoomTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawRoomTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.getService<any>('dispatcher')
    expect(dispatch.execute).not.toHaveBeenCalled()
  })
})
