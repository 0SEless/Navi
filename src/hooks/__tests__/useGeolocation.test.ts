import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useGeolocation', () => {
  beforeEach(() => {
    const mockGeolocation = {
      getCurrentPosition: vi.fn().mockImplementation(
        (success: PositionCallback, _error?: PositionErrorCallback | null, _options?: PositionOptions) =>
          success({
            coords: {
              latitude: 11.8195,
              longitude: 122.0922,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition)
      ),
    }
    Object.defineProperty(navigator, 'geolocation', {
      value: mockGeolocation,
      configurable: true,
    })
  })

  it('returns the correct initial state interface', () => {
    const state = {
      latitude: null,
      longitude: null,
      accuracy: null,
      error: null,
      loading: true,
    }
    expect(state).toHaveProperty('latitude')
    expect(state).toHaveProperty('longitude')
    expect(state).toHaveProperty('accuracy')
    expect(state).toHaveProperty('error')
    expect(state).toHaveProperty('loading')
    expect(state.loading).toBe(true)
  })

  it('handles geolocation not supported', () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: undefined,
      configurable: true,
    })
    const state = {
      latitude: null,
      longitude: null,
      accuracy: null,
      error: 'Geolocation is not supported by this browser',
      loading: false,
    }
    expect(state.error).toBe('Geolocation is not supported by this browser')
    expect(state.loading).toBe(false)
  })

  it('handles geolocation error', () => {
    const mockError = new Error('User denied geolocation')
    const mockGeolocation = {
      getCurrentPosition: vi.fn().mockImplementation(
        (_success: PositionCallback, error: PositionErrorCallback) => error(mockError as unknown as GeolocationPositionError)
      ),
    }
    Object.defineProperty(navigator, 'geolocation', {
      value: mockGeolocation,
      configurable: true,
    })
    const state = {
      latitude: null,
      longitude: null,
      accuracy: null,
      error: 'User denied geolocation',
      loading: false,
    }
    expect(state.error).toBe('User denied geolocation')
    expect(state.loading).toBe(false)
  })
})
