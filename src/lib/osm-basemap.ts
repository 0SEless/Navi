/**
 * The OpenStreetMap street map used under every NAVI map. OpenStreetMap serves tiles up to zoom 19 only; asking
 * for more fails (a CORS error per tile in the console, owner 2026-11-15), so past 19 MapLibre enlarges the zoom-19
 * tiles instead.
 */
export const OSM_MAX_ZOOM = 19
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

export function osmRasterSource() {
  return {
    type: 'raster' as const,
    tiles: [OSM_TILES],
    tileSize: 256,
    maxzoom: OSM_MAX_ZOOM,
    attribution: '&copy; OpenStreetMap contributors',
  }
}
