import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYERS, layerVisibility, loadLayers, saveLayers, STREET_MAP_LAYER } from '../terrain-layers'
import { HILLSHADE_LAYER } from '../terrain-view'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key) },
    setItem: (key, value) => { data.set(key, value) },
  }
}

const throwing: Storage = {
  length: 0,
  clear: () => { throw new Error('blocked') },
  getItem: () => { throw new Error('blocked') },
  key: () => { throw new Error('blocked') },
  removeItem: () => { throw new Error('blocked') },
  setItem: () => { throw new Error('blocked') },
}

describe('terrain layers', () => {
  it('defaults show everything with the ground half see-through', () => {
    expect(DEFAULT_LAYERS).toEqual({
      streetMap: true, streetMapOpacity: 1, ground: true, groundOpacity: 0.5, contours: true,
      buildings: true, roads: true, structures: true, boundary: true, tracing: true,
    })
  })

  it('loadLayers merges stored values over defaults', () => {
    const storage = memoryStorage({ 'navi-terrain-layers': JSON.stringify({ streetMap: false, groundOpacity: 0.8, bogus: 1 }) })
    expect(loadLayers(storage)).toEqual({ ...DEFAULT_LAYERS, streetMap: false, groundOpacity: 0.8 })
  })

  it('loadLayers ignores values of the wrong type', () => {
    const storage = memoryStorage({ 'navi-terrain-layers': JSON.stringify({ ground: 'no', groundOpacity: 7 }) })
    expect(loadLayers(storage)).toEqual(DEFAULT_LAYERS)
  })

  it('loadLayers falls back to defaults when storage throws', () => {
    expect(loadLayers(throwing)).toEqual(DEFAULT_LAYERS)
  })

  it('saveLayers stores and ignores a throwing storage', () => {
    const storage = memoryStorage()
    saveLayers({ ...DEFAULT_LAYERS, roads: false }, storage)
    expect(loadLayers(storage).roads).toBe(false)
    expect(() => saveLayers(DEFAULT_LAYERS, throwing)).not.toThrow()
  })

  it('layerVisibility hides the street map and ground when off', () => {
    const visibility = layerVisibility({ ...DEFAULT_LAYERS, streetMap: false, ground: false, boundary: false, structures: false })
    expect(visibility[STREET_MAP_LAYER]).toBe('none')
    expect(visibility['terrain-background']).toBe('none')
    expect(visibility[HILLSHADE_LAYER]).toBe('none')
    expect(visibility['terrain-boundary']).toBe('none')
    expect(visibility['terrain-structures']).toBe('none')
    expect(layerVisibility(DEFAULT_LAYERS)[STREET_MAP_LAYER]).toBe('visible')
  })
})
