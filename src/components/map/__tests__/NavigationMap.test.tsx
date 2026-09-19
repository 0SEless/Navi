import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mapInstances = vi.hoisted(() => [] as Array<{
  fitBounds: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  navigationControlOptions?: unknown
  mapOptions?: Record<string, unknown>
}>)

vi.mock('maplibre-gl', () => {
  class FakeMap {
    fitBounds = vi.fn()
    remove = vi.fn()

    constructor(options: Record<string, unknown>) {
      this.mapOptions = options
      mapInstances.push(this)
    }

    addControl(control: { options?: unknown }) {
      if (control.options) this.navigationControlOptions = control.options
    }

    on(type: string, listener: () => void) {
      if (type === 'load') queueMicrotask(listener)
    }
  }

  return {
    default: {
      Map: FakeMap,
      NavigationControl: class NavigationControl {
        constructor(public options?: unknown) {}
      },
      AttributionControl: class AttributionControl {},
    },
  }
})

import NavigationMap from '../NavigationMap'

const bounds = { minLat: 11.8, maxLat: 11.81, minLng: 122.1, maxLng: 122.11 }

describe('NavigationMap bounds policy', () => {
  it('keeps existing bounds fitting enabled by default', async () => {
    mapInstances.length = 0
    render(<NavigationMap bounds={bounds} />)

    await waitFor(() => expect(mapInstances[0]?.fitBounds).toHaveBeenCalledTimes(1))
  })

  it('allows Capture to opt out of bounds refits without changing the default', async () => {
    mapInstances.length = 0
    render(<NavigationMap bounds={bounds} fitBoundsOnChange={false} />)

    await waitFor(() => expect(mapInstances[0]).toBeDefined())
    expect(mapInstances[0].fitBounds).not.toHaveBeenCalled()
  })

  it('allows Explore to hide permanent zoom controls while keeping compass hidden', async () => {
    mapInstances.length = 0
    render(<NavigationMap showZoomControls={false} />)

    await waitFor(() => expect(mapInstances[0]).toBeDefined())
    expect(mapInstances[0].navigationControlOptions).toEqual({
      showCompass: false,
      showZoom: false,
    })
  })

  it('passes an explicit maximum pitch to MapLibre', async () => {
    mapInstances.length = 0
    render(<NavigationMap maxPitch={85} />)

    await waitFor(() => expect(mapInstances[0]).toBeDefined())
    expect(mapInstances[0].mapOptions?.maxPitch).toBe(85)
  })
})
