import { describe, expect, it, vi } from 'vitest'
import type maplibregl from 'maplibre-gl'
import { styleReady, whenStyleReady } from '../style-ready'

function fakeMap(opts: { styleLoaded: boolean; tilesDone: boolean }) {
  const once = vi.fn()
  const map = { style: { _loaded: opts.styleLoaded }, isStyleLoaded: () => opts.styleLoaded && opts.tilesDone, once }
  return { map: map as unknown as maplibregl.Map, once }
}

describe('style-ready', () => {
  it('is ready when the style has loaded even while tiles (the street map) are still coming', () => {
    expect(styleReady(fakeMap({ styleLoaded: true, tilesDone: false }).map)).toBe(true)
  })

  it('is not ready before the style has loaded', () => {
    expect(styleReady(fakeMap({ styleLoaded: false, tilesDone: false }).map)).toBe(false)
  })

  it('whenStyleReady runs at once when ready', () => {
    const { map, once } = fakeMap({ styleLoaded: true, tilesDone: false })
    const run = vi.fn()
    whenStyleReady(map, run)
    expect(run).toHaveBeenCalledTimes(1)
    expect(once).not.toHaveBeenCalled()
  })

  it('whenStyleReady waits for style.load otherwise', () => {
    const { map, once } = fakeMap({ styleLoaded: false, tilesDone: false })
    const run = vi.fn()
    whenStyleReady(map, run)
    expect(run).not.toHaveBeenCalled()
    expect(once).toHaveBeenCalledWith('style.load', run)
  })
})
