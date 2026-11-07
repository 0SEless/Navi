import maplibregl from 'maplibre-gl'

// The pure parts (encoding, tile bounds, the cache) live in dem-encode.ts so the terrain worker can use them.
import { encodeDemTile, TerrainTileCache } from './dem-encode'
export { decodeDemPixel, demTileBounds, encodeDemTile, TerrainTileCache, type LngLatBox } from './dem-encode'

/** The cache shared by every terrain map in the tab. */
export const terrainTileCache = new TerrainTileCache()

/** Tile URL template with a version, so a new version reloads every tile of the source. */
export function demTileUrl(scheme: string, version: number): string {
  return `${scheme}://{z}/{x}/{y}?v=${version}`
}

/**
 * Registers `scheme://z/x/y` as a terrain tile protocol. `getHeightAt` is read for every tile, so it can
 * follow the latest document. Returns the unregister function.
 */
export function registerTerrainProtocol(
  scheme: string,
  getHeightAt: () => ((lat: number, lng: number) => number) | null,
  /** Builds the tile off the main thread when it can (null: build it here). */
  fromWorker?: (z: number, x: number, y: number) => Promise<Uint8ClampedArray<ArrayBuffer> | null> | null,
): () => void {
  const size = 256
  maplibregl.addProtocol(scheme, async (params) => {
    const match = /:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url)
    if (!match) throw new Error(`Bad terrain tile url ${params.url}`)
    const [z, x, y] = match.slice(1).map(Number)
    // Handed to a map from now on: a change committed while this tile is still being built reloads it too.
    terrainTileCache.served(z, x, y)
    // The cache keeps raw RGBA pixels; MapLibre takes an ImageBitmap directly (no PNG encode/decode).
    const cached = terrainTileCache.get(scheme, z, x, y)
    let pixels: Uint8ClampedArray<ArrayBuffer>
    if (cached) pixels = new Uint8ClampedArray(cached)
    else {
      const startedAt = terrainTileCache.epoch
      const built = await (fromWorker?.(z, x, y) ?? null)
      pixels = built ?? encodeDemTile(z, x, y, getHeightAt() ?? (() => 0), size)
      terrainTileCache.set(scheme, z, x, y, pixels.buffer, startedAt)
    }
    return { data: await createImageBitmap(new ImageData(pixels, size, size)) }
  })
  return () => maplibregl.removeProtocol(scheme)
}
