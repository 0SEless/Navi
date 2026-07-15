import { describe, it, expect, vi } from 'vitest'
import { drawRoomTool } from './draw-room-tool'
import type { ToolContext, ToolPointerEvent } from './types'

function createCtx(): ToolContext {
  const dispatch = vi.fn()
  const publishPreview = vi.fn()
  return {
    services: {
      dispatcher: { execute: dispatch },
      viewport: { activeBuildingId: 'bld-1', activeFloorId: 'flr-1' },
    } as any,
    transformer: { worldToBuildingLocal: (_w: { lat: number; lng: number }, _b: string) => ({ x: 1, y: 2 }) } as any,
    publishPreview,
  } as ToolContext
}

function makeEvent(lng: number, lat: number): ToolPointerEvent {
  return { x: 0, y: 0, lng, lat, button: 0, shiftKey: false, ctrlKey: false, altKey: false }
}

describe('drawRoomTool preview ownership', () => {
  it('publishes an empty preview on activate', () => {
    const ctx = createCtx()
    drawRoomTool.onActivate?.(ctx)
    expect(ctx.publishPreview).toHaveBeenCalledWith([])
  })

  it('publishes accumulated vertices on each pointer down', () => {
    const ctx = createCtx()
    drawRoomTool.onActivate?.(ctx)
    drawRoomTool.onPointerDown?.(makeEvent(1, 2), ctx)
    expect(ctx.publishPreview).toHaveBeenLastCalledWith([{ lat: 2, lng: 1 }])
    drawRoomTool.onPointerDown?.(makeEvent(3, 4), ctx)
    expect(ctx.publishPreview).toHaveBeenLastCalledWith([{ lat: 2, lng: 1 }, { lat: 4, lng: 3 }])
  })

  it('clears the preview when the polygon is finished', () => {
    const ctx = createCtx()
    drawRoomTool.onActivate?.(ctx)
    drawRoomTool.onPointerDown?.(makeEvent(1, 2), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(3, 4), ctx)
    drawRoomTool.onPointerDown?.(makeEvent(5, 6), ctx)
    drawRoomTool.onKeyDown?.(new KeyboardEvent('keydown', { key: 'Enter' }), ctx)
    expect(ctx.publishPreview).toHaveBeenLastCalledWith([])
    expect(ctx.services.dispatcher.execute).toHaveBeenCalledTimes(1)
  })

  it('clears the preview on Escape cancel', () => {
    const ctx = createCtx()
    drawRoomTool.onActivate?.(ctx)
    drawRoomTool.onPointerDown?.(makeEvent(1, 2), ctx)
    drawRoomTool.onKeyDown?.(new KeyboardEvent('keydown', { key: 'Escape' }), ctx)
    expect(ctx.publishPreview).toHaveBeenLastCalledWith([])
    expect(ctx.services.dispatcher.execute).not.toHaveBeenCalled()
  })
})
