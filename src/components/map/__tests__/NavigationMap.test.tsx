import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mapInstances = vi.hoisted(() => [] as Array<{
  fitBounds: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  setMaxBounds: ReturnType<typeof vi.fn>
  setMinZoom: ReturnType<typeof vi.fn>
  navigationControlOptions?: unknown
  mapOptions?: Record<string, unknown>
}>)

vi.mock('maplibre-gl', () => {
  class FakeMap {
    fitBounds = vi.fn()
    remove = vi.fn()
    setMaxBounds = vi.fn()
    setMinZoom = vi.fn()
    cameraForBounds = vi.fn(() => ({ zoom: 16.4 }))

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

describe('NavigationMap campus-only mode (terrain plan Task 15)', () => {
  const site = {
    version: 1, terrain: null, roads: [], structures: [], presets: [], buildings: [],
    boundary: [{ lat: 11.8163, lng: 122.169 }, { lat: 11.8163, lng: 122.173 }, { lat: 11.819, lng: 122.173 }, { lat: 11.819, lng: 122.169 }],
  }

  it('with site: no OSM source is added and maxBounds is set (the campus plus 50 m)', async () => {
    mapInstances.length = 0
    render(<NavigationMap site={site as never} />)
    await waitFor(() => expect(mapInstances[0]?.setMaxBounds).toHaveBeenCalledTimes(1))
    const style = mapInstances[0].mapOptions!.style as { sources: Record<string, unknown>; layers: Array<{ id: string; type: string }> }
    expect(Object.keys(style.sources)).toEqual([])
    expect(style.layers.map((l) => l.type)).toEqual(['background'])
    const [[w, s], [e, n]] = mapInstances[0].setMaxBounds.mock.calls[0][0] as [[number, number], [number, number]]
    expect(122.169 - w).toBeCloseTo(50 / (111320 * Math.cos((11.8177 * Math.PI) / 180)), 5)
    expect(11.8163 - s).toBeCloseTo(50 / 111320, 6)
    expect(e).toBeGreaterThan(122.173)
    expect(n).toBeGreaterThan(11.819)
    // Zoom out stops at the zoom that shows the whole campus.
    // Zoom out stops at the whole campus, but never above 15: the navigation camera's top view caps
    // the max zoom at 16 and MapLibre refuses a max below the min (P10 found it).
    expect(mapInstances[0].setMinZoom).toHaveBeenCalledWith(15)
  })

  it('without site: the OSM base map as before, no camera limits', async () => {
    mapInstances.length = 0
    render(<NavigationMap />)
    await waitFor(() => expect(mapInstances[0]).toBeDefined())
    const style = mapInstances[0].mapOptions!.style as { sources: Record<string, unknown> }
    expect(Object.keys(style.sources)).toEqual(['osm'])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mapInstances[0].setMaxBounds).not.toHaveBeenCalled()
  })
})

