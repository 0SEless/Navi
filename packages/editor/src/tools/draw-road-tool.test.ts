import { describe, it, expect, vi } from 'vitest'
import { drawRoadTool } from './draw-road-tool'
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

describe('drawRoadTool', () => {
  it('has correct id, label, and cursor', () => {
    expect(drawRoadTool.id).toBe('draw-road')
    expect(drawRoadTool.label).toBe('Draw Road')
    expect(drawRoadTool.cursor).toBe('crosshair')
  })

  it('enters active state on activate', () => {
    const ctx = createCtx()
    drawRoadTool.onActivate?.(ctx)
    drawRoadTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawRoadTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawRoadTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.services.dispatcher
    expect(dispatch.execute).toHaveBeenCalledTimes(1)
  })

  it('onPointerDown adds vertex and Enter dispatches command', () => {
    const ctx = createCtx()
    drawRoadTool.onActivate?.(ctx)
    drawRoadTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawRoadTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawRoadTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.services.dispatcher
    expect(dispatch.execute).toHaveBeenCalledTimes(1)
    const cmd = dispatch.execute.mock.calls[0][0]
    expect(cmd.id).toBe('road.create')
    expect(cmd.payload.points).toHaveLength(2)
    expect(cmd.payload.width).toBe(5)
    expect(cmd.payload.surface).toBe('paved')
    expect(cmd.payload.type).toBe('service')
  })

  it('Escape key cancels and clears vertices', () => {
    const ctx = createCtx()
    drawRoadTool.onActivate?.(ctx)
    drawRoadTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawRoadTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawRoadTool.onKeyDown?.(makeKeyEvent('Escape'), ctx)
    drawRoadTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.services.dispatcher
    expect(dispatch.execute).not.toHaveBeenCalled()
  })

  it('Backspace removes last vertex', () => {
    const ctx = createCtx()
    drawRoadTool.onActivate?.(ctx)
    drawRoadTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawRoadTool.onPointerDown?.(makeEvent(11, 21), ctx)
    drawRoadTool.onKeyDown?.(makeKeyEvent('Backspace'), ctx)
    drawRoadTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.services.dispatcher
    expect(dispatch.execute).not.toHaveBeenCalled()
  })

  it('finish with single vertex does not dispatch (minimum 2 points)', () => {
    const ctx = createCtx()
    drawRoadTool.onActivate?.(ctx)
    drawRoadTool.onPointerDown?.(makeEvent(10, 20), ctx)
    drawRoadTool.onKeyDown?.(makeKeyEvent('Enter'), ctx)
    const dispatch = ctx.services.dispatcher
    expect(dispatch.execute).not.toHaveBeenCalled()
  })
})
