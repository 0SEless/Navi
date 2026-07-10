import { describe, it, expect, vi } from 'vitest'
import { placeElevatorTool } from './place-elevator-tool'
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

function createCtx(s: ReturnType<typeof makeServices>): ToolContext {
  return { services: s.services as any }
}

function makeEvent(lng: number, lat: number): ToolPointerEvent {
  return { x: 0, y: 0, lng, lat, button: 0, shiftKey: false, ctrlKey: false, altKey: false }
}

function makeKeyEvent(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key })
}

describe('placeElevatorTool', () => {
  it('has correct id, label, cursor', () => {
    expect(placeElevatorTool.id).toBe('place-elevator')
    expect(placeElevatorTool.label).toBe('Place Elevator')
    expect(placeElevatorTool.cursor).toBe('crosshair')
  })

  it('dispatches elevator.create on pointer down', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placeElevatorTool.onPointerDown!(makeEvent(50, 60), ctx)

    expect(s.dispatch).toHaveBeenCalledWith({
      id: 'elevator.create',
      label: 'Create Elevator',
      payload: {
        buildingId: 'b1',
        floorId: 'f1',
        name: 'Elevator',
        position: { x: 50, y: 60 },
      },
    })
  })

  it('applies defaults when viewport is missing', () => {
    const s = makeServices({ viewport: true })
    const ctx = createCtx(s)
    placeElevatorTool.onPointerDown!(makeEvent(15, 25), ctx)

    expect(s.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ buildingId: '', floorId: '' }),
      }),
    )
  })

  it('switches to select after placing', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placeElevatorTool.onPointerDown!(makeEvent(0, 0), ctx)

    expect(s.activate).toHaveBeenCalledWith('select', ctx)
  })

  it('cancels on Escape', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placeElevatorTool.onKeyDown!(makeKeyEvent('Escape'), ctx)

    expect(s.activate).toHaveBeenCalledWith('select', ctx)
  })

  it('does not cancel on other keys', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placeElevatorTool.onKeyDown!(makeKeyEvent('Enter'), ctx)

    expect(s.activate).not.toHaveBeenCalled()
  })
})
