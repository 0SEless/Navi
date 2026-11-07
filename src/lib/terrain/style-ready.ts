import type maplibregl from 'maplibre-gl'

/**
 * The map's style itself has loaded, so layers and sources can be added, even while tiles are still
 * coming. `isStyleLoaded()` also waits for tiles: with the street map underneath (section 5), offline
 * or blocked map tiles would keep it false and our own layers would never be added.
 */
export function styleReady(map: maplibregl.Map): boolean {
  const style = (map as unknown as { style?: { _loaded?: boolean } }).style
  return style?._loaded === true || Boolean(map.isStyleLoaded())
}

/** Runs `fn` now when the style is ready, else once it has loaded. */
export function whenStyleReady(map: maplibregl.Map, fn: () => void): void {
  if (styleReady(map)) fn()
  else map.once('style.load', fn)
}
