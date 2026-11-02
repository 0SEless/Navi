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

/** Tile URL template with a version, so a new version reloads every tile of the source. */
export function demTileUrl(scheme: string, version: number): string {
  return `${scheme}://{z}/{x}/{y}?v=${version}`
}

/**
 * Registers `scheme://z/x/y` as a terrain tile protocol. `getHeightAt` is read for every tile, so it can
 * follow the latest document. Returns the unregister function.
 */
export function registerTerrainProtocol(scheme: string, getHeightAt: () => ((lat: number, lng: number) => number) | null): () => void {
  maplibregl.addProtocol(scheme, async (params) => {
    const match = /:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url)
    if (!match) throw new Error(`Bad terrain tile url ${params.url}`)
    const [z, x, y] = match.slice(1).map(Number)
    const heightAt = getHeightAt() ?? (() => 0)
    const size = 256
    const canvas = new OffscreenCanvas(size, size)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No 2D canvas for terrain tiles.')
    context.putImageData(new ImageData(encodeDemTile(z, x, y, heightAt, size), size, size), 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return { data: await blob.arrayBuffer() }
  })
  return () => maplibregl.removeProtocol(scheme)
}
