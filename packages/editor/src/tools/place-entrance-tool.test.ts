import { describe, it, expect, vi } from 'vitest'
import { placeEntranceTool } from './place-entrance-tool'
import type { ToolPointerEvent, ToolContext } from './types'

function makeServices(overrides?: { viewport?: boolean }) {
  const dispatch = vi.fn()
  const activate = vi.fn()
  const services: Record<string, unknown> = {
    dispatcher: { execute: dispatch },
    toolRegistry: { activate },
  }
  if (!overrides?.viewport) {
    services.viewport = { activeBuildingId: 'b1', activeFloorId: 'f1' }
  }
  return { dispatch, activate, services }
}

function createCtx(services: ReturnType<typeof makeServices>): ToolContext {
  return { getService: (name: string) => services.services[name] }
}

function makeEvent(lng: number, lat: number): ToolPointerEvent {
  return { x: 0, y: 0, lng, lat, button: 0, shiftKey: false, ctrlKey: false, altKey: false }
}

function makeKeyEvent(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key })
}

describe('placeEntranceTool', () => {
  it('has correct id, label, cursor', () => {
    expect(placeEntranceTool.id).toBe('place-entrance')
    expect(placeEntranceTool.label).toBe('Place Entrance')
    expect(placeEntranceTool.cursor).toBe('crosshair')
  })

  it('dispatches entrance.create on pointer down', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placeEntranceTool.onPointerDown!(makeEvent(10, 20), ctx)

    expect(s.dispatch).toHaveBeenCalledWith({
      id: 'entrance.create',
      label: 'Create Entrance',
      payload: {
        buildingId: 'b1',
        floorId: 'f1',
        label: 'Entrance',
        position: { lat: 20, lng: 10 },
        type: 'side',
      },
    })
  })

  it('applies defaults when viewport is missing', () => {
    const s = makeServices({ viewport: true })
    const ctx = createCtx(s)
    placeEntranceTool.onPointerDown!(makeEvent(15, 25), ctx)

    expect(s.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ buildingId: '', floorId: '' }),
      }),
    )
  })

  it('switches to select after placing', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placeEntranceTool.onPointerDown!(makeEvent(0, 0), ctx)

    expect(s.activate).toHaveBeenCalledWith('select', ctx)
  })

  it('cancels on Escape', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placeEntranceTool.onKeyDown!(makeKeyEvent('Escape'), ctx)

    expect(s.activate).toHaveBeenCalledWith('select', ctx)
  })

  it('does not cancel on other keys', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placeEntranceTool.onKeyDown!(makeKeyEvent('Enter'), ctx)

    expect(s.activate).not.toHaveBeenCalled()
  })
})
