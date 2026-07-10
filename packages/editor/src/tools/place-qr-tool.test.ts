import { describe, it, expect, vi } from 'vitest'
import { placeQrTool } from './place-qr-tool'
import type { ToolPointerEvent, ToolContext } from './types'

function makeServices() {
  const dispatch = vi.fn()
  const activate = vi.fn()
  return { dispatch, activate, services: { dispatcher: { execute: dispatch }, toolRegistry: { activate } } }
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

describe('placeQrTool', () => {
  it('has correct id, label, cursor', () => {
    expect(placeQrTool.id).toBe('place-qr')
    expect(placeQrTool.label).toBe('Place QR Code')
    expect(placeQrTool.cursor).toBe('crosshair')
  })

  it('dispatches qr.create on pointer down', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placeQrTool.onPointerDown!(makeEvent(90, 100), ctx)

    expect(s.dispatch).toHaveBeenCalledWith({
      id: 'qr.create',
      label: 'Create QR Checkpoint',
      payload: {
        label: 'QR',
        position: { lat: 100, lng: 90 },
        code: expect.stringMatching(/^qr-\d+$/),
        buildingId: '',
        floor: 0,
      },
    })
  })

  it('switches to select after placing', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placeQrTool.onPointerDown!(makeEvent(0, 0), ctx)

    expect(s.activate).toHaveBeenCalledWith('select', ctx)
  })

  it('does not crash when services are available', () => {
    const ctx: ToolContext = {
      services: { dispatcher: { execute: vi.fn() }, toolRegistry: { activate: vi.fn() } } as any,
    }
    expect(() => placeQrTool.onPointerDown!(makeEvent(0, 0), ctx)).not.toThrow()
  })

  it('cancels on Escape', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placeQrTool.onKeyDown!(makeKeyEvent('Escape'), ctx)

    expect(s.activate).toHaveBeenCalledWith('select', ctx)
  })

  it('does not cancel on other keys', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placeQrTool.onKeyDown!(makeKeyEvent('Enter'), ctx)

    expect(s.activate).not.toHaveBeenCalled()
  })
})
