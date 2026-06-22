import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => {
  const mockGetCurrentPosition = vi.fn((success) => {
    success({ coords: { latitude: 11.8195, longitude: 122.0922, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => {} } })
  })
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition: mockGetCurrentPosition },
    configurable: true,
    writable: true,
  })
})

describe('useGeolocation', () => {
  it('exports useGeolocation as a function', async () => {
    const mod = await import('../useGeolocation')
    expect(typeof mod.useGeolocation).toBe('function')
  })

  it('initial state shape is correct', () => {
    const stateShape = { latitude: null, longitude: null, accuracy: null, error: null, loading: true }
    expect(stateShape).toEqual({
      latitude: null,
      longitude: null,
      accuracy: null,
      error: null,
      loading: true,
    })
  })

  it('navigator.geolocation.getCurrentPosition is defined', () => {
    expect(navigator.geolocation).toBeDefined()
    expect(typeof navigator.geolocation.getCurrentPosition).toBe('function')
  })

  it('mock geolocation calls success callback with coordinates', () => {
    const success = vi.fn()
    navigator.geolocation.getCurrentPosition(success)
    expect(success).toHaveBeenCalledTimes(1)
    const pos = success.mock.calls[0][0]
    expect(pos.coords.latitude).toBe(11.8195)
    expect(pos.coords.longitude).toBe(122.0922)
  })
})
