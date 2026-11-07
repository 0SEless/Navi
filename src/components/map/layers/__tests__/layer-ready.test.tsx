import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { BuildingLayer } from '../BuildingLayer'

afterEach(cleanup)

/** A map whose style is still loading when the layer mounts, after its one 'load' already fired. */
function loadingMap() {
  const handlers = new Map<string, Array<() => void>>()
  const layers: string[] = []
  const sources = new Set<string>()
  const state = { loaded: false }
  return {
    layers, state,
    on(type: string, fn: () => void) { handlers.set(type, [...(handlers.get(type) ?? []), fn]) },
    off(type: string, fn: () => void) { handlers.set(type, (handlers.get(type) ?? []).filter((f) => f !== fn)) },
    fire(type: string) { for (const fn of [...(handlers.get(type) ?? [])]) fn() },
    isStyleLoaded: () => state.loaded,
    getSource: (id: string) => (sources.has(id) ? { setData: () => {} } : undefined),
    addSource: (id: string) => { sources.add(id) },
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    addLayer: (layer: { id: string }) => { layers.push(layer.id) },
    removeLayer: (id: string) => { layers.splice(layers.indexOf(id), 1) },
    removeSource: (id: string) => { sources.delete(id) },
    setFeatureState: () => {},
    triggerRepaint: () => {},
    getCanvas: () => ({ style: { cursor: '' } }),
  }
}

describe('map layers set up even when the style is still loading (Task 15)', () => {
  it('BuildingLayer sets up when a source delivers data, if it mounted while sources were loading', () => {
    const map = loadingMap()
    render(<BuildingLayer map={map as never} buildings={[]} />)
    expect(map.layers).not.toContain('buildings-fill')
    map.state.loaded = true
    act(() => map.fire('sourcedata'))
    expect(map.layers).toContain('buildings-fill')
  })
})
