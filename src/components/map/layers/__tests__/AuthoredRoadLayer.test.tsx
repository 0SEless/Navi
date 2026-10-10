import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type maplibregl from 'maplibre-gl'
import { AuthoredRoadLayer } from '../AuthoredRoadLayer'
import type { TracePath } from '@/types/nav-types'

afterEach(cleanup)

describe('AuthoredRoadLayer', () => {
  it('waits for style readiness, attaches road layers, and refreshes authored data', () => {
    let styleLoaded = false
    const listeners = new Map<string, Set<() => void>>()
    const source = { setData: vi.fn() }
    const sources = new Map<string, typeof source>()
    const layers = new Map<string, unknown>()
    const map = {
      isStyleLoaded: () => styleLoaded,
      on: (event: string, listener: () => void) => {
        const registered = listeners.get(event) ?? new Set()
        registered.add(listener)
        listeners.set(event, registered)
      },
      off: (event: string, listener: () => void) => { listeners.get(event)?.delete(listener) },
      addSource: (id: string) => { sources.set(id, source) },
      getSource: (id: string) => sources.get(id),
      addLayer: (layer: { id: string }) => { layers.set(layer.id, layer) },
      getLayer: (id: string) => layers.get(id),
      removeLayer: (id: string) => { layers.delete(id) },
      removeSource: (id: string) => { sources.delete(id) },
      triggerRepaint: vi.fn(),
    } as unknown as maplibregl.Map
    const firstTrace: TracePath = {
      id: 'road-first', floor: 0, type: 'arterial',
      points: [{ lat: 10, lng: 20 }, { lat: 10.001, lng: 20.001 }],
    }
    const nextTrace: TracePath = {
      id: 'road-next', floor: 0, type: 'connector',
      points: [{ lat: 10.002, lng: 20.002 }, { lat: 10.003, lng: 20.003 }],
    }
    const view = render(<AuthoredRoadLayer map={map} traces={[firstTrace]} />)

    expect(sources.size).toBe(0)
    styleLoaded = true
    act(() => { for (const listener of listeners.get('idle') ?? []) listener() })

    expect([...layers.keys()]).toEqual(expect.arrayContaining([
      'authored-roads-outline', 'authored-roads-fill', 'authored-roads-path',
    ]))
    expect(source.setData).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'FeatureCollection',
      features: [expect.objectContaining({ id: 'road-first' })],
    }))

    view.rerender(<AuthoredRoadLayer map={map} traces={[nextTrace]} />)
    expect(source.setData).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'FeatureCollection',
      features: [expect.objectContaining({ id: 'road-next' })],
    }))
  })
})
