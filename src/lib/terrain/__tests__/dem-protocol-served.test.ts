import { describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (params: { url: string }) => Promise<unknown>>()
vi.mock('maplibre-gl', () => ({
  default: {
    addProtocol: (scheme: string, fn: (params: { url: string }) => Promise<unknown>) => handlers.set(scheme, fn),
    removeProtocol: (scheme: string) => handlers.delete(scheme),
  },
}))

import { registerTerrainProtocol, terrainTileCache } from '../dem-protocol'

describe('registerTerrainProtocol', () => {
  it('a tile still being built counts as handed to the map (a change committed meanwhile reloads it)', () => {
    const off = registerTerrainProtocol('probe-terrain', () => () => 0, () => new Promise(() => {})) // the worker never answers
    void handlers.get('probe-terrain')!({ url: 'probe-terrain://19/440064/244813' })
    expect(terrainTileCache.tilesIn('all')).toContainEqual({ z: 19, x: 440064, y: 244813 })
    off()
  })
})
