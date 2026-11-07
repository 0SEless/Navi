import { describe, expect, it } from 'vitest'
import { toLatLng, type TerrainGrid } from '@navi/core'
import { decodeDemPixel, demTileBounds, TerrainTileCache } from '../dem-encode'
import { createWorkerCore } from '../terrain-worker-core'
import { createTerrainWorkerClient, type WorkerLike } from '../terrain-worker-client'

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const area = { x0: 0, y0: 0, cols: 200, rows: 200 }
const Z = 19

/** Web-mercator tile and pixel (256) holding a local point. */
function tileAt(x: number, y: number) {
  const p = toLatLng(grid, { x, y })
  const n = 2 ** Z
  const fx = ((p.lng + 180) / 360) * n
  const latRad = (p.lat * Math.PI) / 180
  const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  return { z: Z, x: Math.floor(fx), y: Math.floor(fy), px: Math.floor((fx % 1) * 256), py: Math.floor((fy % 1) * 256) }
}
const heightOf = (pixels: Uint8ClampedArray, px: number, py: number) => {
  const i = (py * 256 + px) * 4
  return decodeDemPixel(pixels[i], pixels[i + 1], pixels[i + 2])
}

describe('terrain worker core', () => {
  it('a patch then a tile request returns the patched heights', () => {
    const core = createWorkerCore()
    core.handle({ kind: 'init', grid, area, heights: new Float32Array(200 * 200), changes: new Float32Array(200 * 200) })
    const rect = { minX: 90, minY: 90, maxX: 110, maxY: 110 }
    const w = 21
    core.handle({ kind: 'patch', rect, heights: new Float32Array(w * w).fill(5), changes: new Float32Array(w * w).fill(5) })
    const t = tileAt(100, 100)
    const heights = core.handle({ kind: 'tile', id: 1, scheme: 'heights', z: t.z, x: t.x, y: t.y })
    expect(heights?.reply.id).toBe(1)
    expect(heightOf(heights!.reply.pixels!, t.px, t.py)).toBeCloseTo(5, 1)
    const far = tileAt(20, 20)
    const flat = core.handle({ kind: 'tile', id: 2, scheme: 'changes', z: far.z, x: far.x, y: far.y })
    expect(heightOf(flat!.reply.pixels!, far.px, far.py)).toBeCloseTo(0, 1)
  })

  it('contour lines follow the patched ground', () => {
    const core = createWorkerCore()
    core.handle({ kind: 'init', grid, area, heights: new Float32Array(200 * 200), changes: new Float32Array(200 * 200) })
    const w = 21
    core.handle({ kind: 'patch', rect: { minX: 90, minY: 90, maxX: 110, maxY: 110 }, heights: new Float32Array(w * w).fill(3.5), changes: new Float32Array(w * w).fill(3.5) })
    const out = core.handle({ kind: 'contours', id: 3, bbox: { minX: 60, minY: 60, maxX: 140, maxY: 140 } })
    const elevations = new Set(out!.reply.geojson!.features.map((f) => (f.properties as { elevation: number }).elevation))
    // A 3.5 m plateau on flat ground crosses the 1, 2 and 3 m levels, not 4 m.
    for (const level of [1, 2, 3]) expect(elevations.has(level)).toBe(true)
    expect(elevations.has(4)).toBe(false)
  })

  it('answers "not ready" before init', () => {
    const out = createWorkerCore().handle({ kind: 'tile', id: 9, scheme: 'heights', z: Z, x: 0, y: 0 })
    expect(out?.reply).toEqual({ id: 9, error: 'not ready' })
  })
})

/** A fake Worker: replies through the core, or fails. */
function fakeWorker(mode: 'ok' | 'error'): WorkerLike & { posted: number } {
  const core = createWorkerCore()
  const w = {
    posted: 0,
    onmessage: null as ((e: { data: unknown }) => void) | null,
    onerror: null as (() => void) | null,
    postMessage(message: never) {
      w.posted++
      if (mode === 'error') {
        queueMicrotask(() => w.onerror?.())
        return
      }
      const out = core.handle(message)
      if (out) queueMicrotask(() => w.onmessage?.({ data: out.reply }))
    },
    terminate() {},
  }
  return w
}

describe('terrain worker client', () => {
  const field = { grid, area, heights: new Float32Array(200 * 200).fill(4), changes: new Float32Array(200 * 200), snapshot: () => { throw new Error('unused') } }

  it('asks the worker for tiles once it has the field', async () => {
    const client = createTerrainWorkerClient(() => fakeWorker('ok'))
    expect(client.tile('heights', Z, 0, 0)).toBeNull() // no field sent yet: build on the main thread
    client.send(field)
    const t = tileAt(100, 100)
    const pixels = await client.tile('heights', t.z, t.x, t.y)
    expect(heightOf(pixels!, t.px, t.py)).toBeCloseTo(4, 1)
  })

  it('the client falls back to the main thread when the worker fails', async () => {
    const throwing = createTerrainWorkerClient(() => {
      throw new Error('no workers here')
    })
    throwing.send(field)
    expect(throwing.tile('heights', Z, 0, 0)).toBeNull()

    const failing = createTerrainWorkerClient(() => fakeWorker('error'))
    failing.send(field)
    await expect(failing.tile('heights', Z, 0, 0)).resolves.toBeNull() // the pending request gives up
    expect(failing.tile('heights', Z, 0, 0)).toBeNull() // and later ones go to the main thread
    expect(failing.contours({ minX: 0, minY: 0, maxX: 10, maxY: 10 })).toBeNull()
  })
})

describe('TerrainTileCache.tilesIn', () => {
  it('tilesIn(rect) lists the z/x/y of loaded tiles overlapping the rect', () => {
    const cache = new TerrainTileCache()
    const a = tileAt(100, 100)
    const b = tileAt(180, 180)
    cache.served(a.z, a.x, a.y)
    cache.served(a.z, a.x, a.y) // two sources, one tile
    cache.served(b.z, b.x, b.y)
    const box = demTileBounds(a.z, a.x, a.y)
    const inner = { west: box.west + 1e-7, east: box.east - 1e-7, south: box.south + 1e-7, north: box.north - 1e-7 }
    expect(cache.tilesIn(inner)).toEqual([{ z: a.z, x: a.x, y: a.y }])
    expect(cache.tilesIn('all')).toHaveLength(2)
  })
})
