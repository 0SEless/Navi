import { act, cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type maplibregl from 'maplibre-gl'
import { BuildingLayer, getBuildingOutlinePaint } from '../BuildingLayer'

afterEach(() => {
  cleanup()
})

function makeMap() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers = new Set<string>()
  return {
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string) => {
      sources.set(id, { setData: vi.fn() })
    }),
    removeSource: vi.fn((id: string) => {
      sources.delete(id)
    }),
    getLayer: vi.fn((id: string) => (layers.has(id) ? { id } : undefined)),
    addLayer: vi.fn((layer: { id: string }) => {
      layers.add(layer.id)
    }),
    removeLayer: vi.fn((id: string) => {
      layers.delete(id)
    }),
    isStyleLoaded: vi.fn(() => true),
    on: vi.fn(),
    off: vi.fn(),
    triggerRepaint: vi.fn(),
    setFeatureState: vi.fn(),
    getCanvas: vi.fn(() => ({ style: { cursor: '' } })),
  } as unknown as maplibregl.Map
}

describe('BuildingLayer selection emphasis', () => {
  it('uses selected outline, width, and opacity emphasis instead of color alone', () => {
    const paint = getBuildingOutlinePaint()
    expect(paint).toBeDefined()
    if (!paint) throw new Error('Building outline paint is unavailable')

    expect(paint['line-color']).toEqual([
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      '#0F6B3A',
      ['get', 'color'],
    ])
    expect(paint['line-width']).toEqual([
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      4,
      2,
    ])
    expect(paint['line-opacity']).toEqual([
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      1,
      0.8,
    ])
  })

  it('does not emit unconditional initialization or data-sync logs', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const building = {
      id: 'building-1',
      name: 'Main Building',
      color: '#0F6B3A',
      height: 10,
      floors: 1,
      entrances: [],
      nodeIds: [],
      footprint: [
        { lat: 10, lng: 20 },
        { lat: 10, lng: 20.001 },
        { lat: 10.001, lng: 20.001 },
      ],
    }

    render(createElement(BuildingLayer, { map: makeMap(), buildings: [building] }))

    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('initializes after a late style-ready event when the map load event has passed', () => {
    let styleLoaded = false
    const listeners = new Map<string, Set<() => void>>()
    const map = makeMap()
    const delayedMap = map as unknown as {
      isStyleLoaded: () => boolean
      on: (event: string, listener: () => void) => void
      off: (event: string, listener: () => void) => void
    }
    delayedMap.isStyleLoaded = () => styleLoaded
    delayedMap.on = (event, listener) => {
      const registered = listeners.get(event) ?? new Set<() => void>()
      registered.add(listener)
      listeners.set(event, registered)
    }
    delayedMap.off = (event, listener) => { listeners.get(event)?.delete(listener) }

    const building = {
      id: 'building-late-style',
      name: 'Late Style Building',
      color: '#0F6B3A',
      height: 10,
      floors: 1,
      entrances: [],
      nodeIds: [],
      footprint: [
        { lat: 10, lng: 20 },
        { lat: 10, lng: 20.001 },
        { lat: 10.001, lng: 20.001 },
      ],
    }
    render(createElement(BuildingLayer, { map, buildings: [building] }))
    expect(map.addSource).not.toHaveBeenCalled()

    styleLoaded = true
    act(() => { for (const listener of listeners.get('idle') ?? []) listener() })

    expect(map.addSource).toHaveBeenCalledWith('buildings', expect.objectContaining({ type: 'geojson' }))
    expect(map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'buildings-fill' }))
    expect(map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'buildings-outline' }))
    expect(map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'buildings-extrusion' }))
    expect(map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'buildings-labels' }))
    const source = map.getSource('buildings') as unknown as { setData: ReturnType<typeof vi.fn> }
    expect(source.setData).toHaveBeenCalledWith(expect.objectContaining({
      features: [expect.objectContaining({ id: building.id })],
    }))
  })
})
