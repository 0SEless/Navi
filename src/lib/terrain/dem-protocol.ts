import maplibregl from 'maplibre-gl'

// Terrain tiles made in the browser from NAVI's own ground (no map server): raster-dem in the
// mapbox encoding, height = (R·65536 + G·256 + B) · 0.1 − 10000.

export function decodeDemPixel(r: number, g: number, b: number): number {
  return (r * 65536 + g * 256 + b) * 0.1 - 10000
}

/** RGBA pixels of tile z/x/y; heightAt is sampled at pixel centres. */
export function encodeDemTile(z: number, x: number, y: number, heightAt: (lat: number, lng: number) => number, size = 256): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(new ArrayBuffer(size * size * 4))
  const n = 2 ** z
  for (let py = 0; py < size; py++) {
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + (py + 0.5) / size)) / n)))
    const lat = (latRad * 180) / Math.PI
    for (let px = 0; px < size; px++) {
      const lng = ((x + (px + 0.5) / size) / n) * 360 - 180
      const h = heightAt(lat, lng)
      const value = Math.max(0, Math.min(16777215, Math.round(((Number.isFinite(h) ? h : 0) + 10000) * 10)))
      const i = (py * size + px) * 4
      pixels[i] = (value >> 16) & 255
      pixels[i + 1] = (value >> 8) & 255
      pixels[i + 2] = value & 255
      pixels[i + 3] = 255
    }
  }
  return pixels
}

export interface LngLatBox { west: number; east: number; south: number; north: number }

/** Geographic bounds of web-mercator tile z/x/y. */
export function demTileBounds(z: number, x: number, y: number): LngLatBox {
  const n = 2 ** z
  const lat = (row: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) * 180) / Math.PI
  return { west: (x / n) * 360 - 180, east: ((x + 1) / n) * 360 - 180, north: lat(y), south: lat(y + 1) }
}

/**
 * Generated tiles by scheme and z/x/y. A new tile version only regenerates the tiles that overlap the
 * area that changed (a brush stroke touches a few), so painting stays responsive.
 */
export class TerrainTileCache {
  private tiles = new Map<string, { z: number; x: number; y: number; data: ArrayBuffer }>()
  /** Bumped by every invalidate: a tile generated across an invalidate is not cached (it may be stale). */
  epoch = 0

  get(scheme: string, z: number, x: number, y: number): ArrayBuffer | null {
    const hit = this.tiles.get(`${scheme}/${z}/${x}/${y}`)
    return hit ? hit.data.slice(0) : null
  }

  set(scheme: string, z: number, x: number, y: number, data: ArrayBuffer, startedAt = this.epoch): void {
    if (startedAt !== this.epoch) return
    this.tiles.set(`${scheme}/${z}/${x}/${y}`, { z, x, y, data: data.slice(0) })
  }

  invalidate(area: LngLatBox | 'all'): void {
    this.epoch++
    if (area === 'all') {
      this.tiles.clear()
      return
    }
    for (const [key, tile] of this.tiles) {
      const b = demTileBounds(tile.z, tile.x, tile.y)
      if (b.west <= area.east && b.east >= area.west && b.south <= area.north && b.north >= area.south) this.tiles.delete(key)
    }
  }
}

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
export function registerTerrainProtocol(scheme: string, getHeightAt: () => ((lat: number, lng: number) => number) | null): () => void {
  const size = 256
  maplibregl.addProtocol(scheme, async (params) => {
    const match = /:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url)
    if (!match) throw new Error(`Bad terrain tile url ${params.url}`)
    const [z, x, y] = match.slice(1).map(Number)
    // The cache keeps raw RGBA pixels; MapLibre takes an ImageBitmap directly (no PNG encode/decode).
    const cached = terrainTileCache.get(scheme, z, x, y)
    let pixels: Uint8ClampedArray<ArrayBuffer>
    if (cached) pixels = new Uint8ClampedArray(cached)
    else {
      const startedAt = terrainTileCache.epoch
      pixels = encodeDemTile(z, x, y, getHeightAt() ?? (() => 0), size)
      terrainTileCache.set(scheme, z, x, y, pixels.buffer, startedAt)
    }
    return { data: await createImageBitmap(new ImageData(pixels, size, size)) }
  })
  return () => maplibregl.removeProtocol(scheme)
}
