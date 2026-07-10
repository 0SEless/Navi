import { describe, it, expect, vi } from 'vitest'
import { placePanoramaTool } from './place-panorama-tool'
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

describe('placePanoramaTool', () => {
  it('has correct id, label, cursor', () => {
    expect(placePanoramaTool.id).toBe('place-panorama')
    expect(placePanoramaTool.label).toBe('Place Panorama')
    expect(placePanoramaTool.cursor).toBe('crosshair')
  })

  it('dispatches panorama.create on pointer down', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placePanoramaTool.onPointerDown!(makeEvent(70, 80), ctx)

    expect(s.dispatch).toHaveBeenCalledWith({
      id: 'panorama.create',
      label: 'Create Panorama',
      payload: {
        label: 'Panorama',
        position: { lat: 80, lng: 70 },
        heading: 0,
        imageAssetId: '',
        buildingId: '',
        floor: 0,
      },
    })
  })

  it('switches to select after placing', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placePanoramaTool.onPointerDown!(makeEvent(0, 0), ctx)

    expect(s.activate).toHaveBeenCalledWith('select', ctx)
  })

  it('does not crash when services are available', () => {
    const ctx: ToolContext = {
      services: { dispatcher: { execute: vi.fn() }, toolRegistry: { activate: vi.fn() } } as any,
    }
    expect(() => placePanoramaTool.onPointerDown!(makeEvent(0, 0), ctx)).not.toThrow()
  })

  it('cancels on Escape', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placePanoramaTool.onKeyDown!(makeKeyEvent('Escape'), ctx)

    expect(s.activate).toHaveBeenCalledWith('select', ctx)
  })

  it('does not cancel on other keys', () => {
    const s = makeServices()
    const ctx = createCtx(s)
    placePanoramaTool.onKeyDown!(makeKeyEvent('Enter'), ctx)

    expect(s.activate).not.toHaveBeenCalled()
  })
})
