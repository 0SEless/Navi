import { describe, it, expect, vi } from 'vitest'
import { drawBuildingTool } from './draw-building-tool'
import type { ToolContext, ToolPointerEvent } from './types'

function createCtx(): ToolContext {
  const dispatch = vi.fn()
  return { services: { dispatcher: { execute: dispatch } } as any }
}

function makeEvent(lng: number, lat: number): ToolPointerEvent {
  return { x: 0, y: 0, lng, lat, button: 0, shiftKey: false, ctrlKey: false, altKey: false }
}

function makeKeyEvent(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key })
}

describe('drawBuildingTool', () => {
  it('has correct id, label, and cursor', () => {
    expect(drawBuildingTool.id).toBe('draw-building')
    expect(drawBuildingTool.label).toBe('Draw Building')
    expect(drawBuildingTool.cursor).toBe('crosshair')
  })

  it('enters active state on activate', () => {
    const ctx = createCtx()
    drawBuildingTool.onActivate?.(ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(12, 22), ctx)
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.services.dispatcher
    expect(dispatch.execute).toHaveBeenCalledTimes(1)
  })

  it('onPointerDown adds vertex and Enter dispatches command', () => {
    const ctx = createCtx()
    drawBuildingTool.onActivate?.(ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(12, 22), ctx)
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.services.dispatcher
    expect(dispatch.execute).toHaveBeenCalledTimes(1)
    const cmd = dispatch.execute.mock.calls[0][0]
    expect(cmd.id).toBe('building.create')
    expect(cmd.payload.footprint.points).toHaveLength(3)
  })

  it('Escape key cancels and clears vertices', () => {
    const ctx = createCtx()
    drawBuildingTool.onActivate?.(ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Escape'), ctx)
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.services.dispatcher
    expect(dispatch.execute).not.toHaveBeenCalled()
  })

  it('Backspace removes last vertex', () => {
    const ctx = createCtx()
    drawBuildingTool.onActivate?.(ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(12, 22), ctx)
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Backspace'), ctx)
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.services.dispatcher
    expect(dispatch.execute).not.toHaveBeenCalled()
  })

  it('finish fails gracefully with too few vertices', () => {
    const ctx = createCtx()
    drawBuildingTool.onActivate?.(ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawBuildingTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawBuildingTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.services.dispatcher
    expect(dispatch.execute).not.toHaveBeenCalled()
  })
})
