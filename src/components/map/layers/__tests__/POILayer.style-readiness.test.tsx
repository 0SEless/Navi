import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type maplibregl from 'maplibre-gl'
import { POILayer } from '../POILayer'
import type { CampusPOI } from '@/types/nav-types'

afterEach(cleanup)

describe('POILayer style lifecycle', () => {
  it('waits for the map style before adding outdoor layers and populates the shared source', () => {
    let styleLoaded = false
    const listeners = new Map<string, Set<() => void>>()
    const source = { setData: vi.fn() }
    const sources = new Map<string, typeof source>()
    const layers = new Map<string, unknown>()
    const map = {
      isStyleLoaded: () => styleLoaded,
      on: (event: string, targetOrListener: string | (() => void), listener?: () => void) => {
        if (typeof targetOrListener === 'function') {
          const registered = listeners.get(event) ?? new Set()
          registered.add(targetOrListener)
          listeners.set(event, registered)
        } else if (listener) {
          const registered = listeners.get(`${event}:${targetOrListener}`) ?? new Set()
          registered.add(listener)
          listeners.set(`${event}:${targetOrListener}`, registered)
        }
      },
      off: (event: string, targetOrListener: string | (() => void), listener?: () => void) => {
        const key = typeof targetOrListener === 'string' ? `${event}:${targetOrListener}` : event
        const target = typeof targetOrListener === 'string' ? listener : targetOrListener
        if (target) listeners.get(key)?.delete(target)
      },
      addSource: (id: string) => { sources.set(id, source) },
      getSource: (id: string) => sources.get(id),
      addLayer: (layer: { id: string }) => { layers.set(layer.id, layer) },
      getLayer: (id: string) => layers.get(id),
      removeLayer: (id: string) => { layers.delete(id) },
      removeSource: (id: string) => { sources.delete(id) },
      triggerRepaint: vi.fn(),
      getCanvas: () => ({ style: { cursor: '' } }),
    } as unknown as maplibregl.Map
    const outdoorPoi: CampusPOI = {
      id: 'poi-courtyard',
      label: 'Courtyard',
      category: 'landmark',
      scope: 'outdoor',
      position: { lat: 10, lng: 20 },
      properties: {},
      geometry: { type: 'rectangle', points: [
        { lat: 10, lng: 20 }, { lat: 10, lng: 20.001 },
        { lat: 10.001, lng: 20.001 }, { lat: 10.001, lng: 20 },
      ] },
      appearance: { mode: '2d', color: '#16A34A' },
    }

    render(<POILayer map={map} pois={[]} outdoorPois={[outdoorPoi]} />)
    expect(sources.size).toBe(0)
    expect(layers.size).toBe(0)

    styleLoaded = true
    act(() => { for (const listener of listeners.get('idle') ?? []) listener() })

    expect([...layers.keys()]).toEqual(expect.arrayContaining([
      'pois-layer', 'pois-outdoor-fill', 'pois-outdoor-outline', 'pois-outdoor-extrusion',
    ]))
    expect(source.setData).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'FeatureCollection',
      features: [expect.objectContaining({ id: 'poi-courtyard', properties: expect.objectContaining({ scope: 'outdoor' }) })],
    }))
  })
})
