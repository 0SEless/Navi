import { describe, expect, it } from 'vitest'
import type { Ray3 } from '../architecture-3d-math'
import { pickArchitectureAsset } from '../architecture-asset-selection'

const prism = (id: string, left = 0, properties: Record<string, unknown> = {}): GeoJSON.Feature<GeoJSON.Polygon> => ({
  type: 'Feature', id: `${id}:piece`, properties: { featureId: id, base: 0, height: 2, ...properties },
  geometry: { type: 'Polygon', coordinates: [[[left, 0], [left + 1, 0], [left + 1, 1], [left, 1], [left, 0]]] },
})
const ray: Ray3 = { origin: { x: -2, y: 0.5, z: 1 }, direction: { x: 1, y: 0, z: 0 } }

describe('pickArchitectureAsset', () => {
  it('selects the nearest prism side independently of feature order', () => {
    expect(pickArchitectureAsset(ray, [prism('far', 4), prism('near')])).toEqual({ id: 'near', distance: 2 })
  })

  it('returns canonical door, opening or stair IDs instead of generated piece IDs', () => {
    expect(pickArchitectureAsset(ray, [prism('stair', 0, { doorId: 'door', openingId: 'opening' })])?.id).toBe('door')
    expect(pickArchitectureAsset(ray, [prism('stair', 0, { openingId: 'opening' })])?.id).toBe('opening')
    expect(pickArchitectureAsset(ray, [prism('stair')])?.id).toBe('stair')
  })

  it('intersects top and bottom caps and a ray starting inside the prism', () => {
    expect(pickArchitectureAsset({ origin: { x: 0.5, y: 0.5, z: 5 }, direction: { x: 0, y: 0, z: -1 } }, [prism('top')])).toEqual({ id: 'top', distance: 3 })
    expect(pickArchitectureAsset({ origin: { x: 0.5, y: 0.5, z: -1 }, direction: { x: 0, y: 0, z: 1 } }, [prism('bottom')])).toEqual({ id: 'bottom', distance: 1 })
    expect(pickArchitectureAsset({ ...ray, origin: { x: 0.5, y: 0.5, z: 1 } }, [prism('inside')])).toEqual({ id: 'inside', distance: 0.5 })
  })

  it('hits a thin rotated door leaf without selecting outside its footprint', () => {
    const door = prism('leaf', 0, { doorId: 'door' })
    const cos = Math.cos(Math.PI / 6), sin = Math.sin(Math.PI / 6)
    door.geometry.coordinates = [[[0, 0], [1, 0], [1, 0.03], [0, 0.03], [0, 0]].map(([x, y]) => [x * cos - y * sin, x * sin + y * cos])]
    const hit = pickArchitectureAsset({ origin: { x: cos * 0.5, y: sin * 0.5, z: 3 }, direction: { x: 0, y: 0, z: -1 } }, [door])
    expect(hit?.id).toBe('door')
    expect(hit?.distance).toBeCloseTo(1)
    expect(pickArchitectureAsset({ origin: { x: 0.1, y: 0.8, z: 3 }, direction: { x: 0, y: 0, z: -1 } }, [door])).toBeNull()
  })

  it('respects nearer opaque occluders with a small equality tolerance', () => {
    expect(pickArchitectureAsset(ray, [prism('door')], 1)).toBeNull()
    expect(pickArchitectureAsset(ray, [prism('door')], 2 - 0.5e-6)?.id).toBe('door')
    expect(pickArchitectureAsset(ray, [prism('door')], 2 - 2e-6)).toBeNull()
  })

  it('rejects missing canonical IDs, bad heights, invalid rays and collapsed or malformed rings', () => {
    const noId = prism('bad'); noId.properties = { base: 0, height: 2 }
    const nan = prism('nan'); nan.geometry.coordinates[0][1][0] = NaN
    const collapsed = prism('collapsed'); collapsed.geometry.coordinates[0] = Array.from({ length: 5 }, () => [0, 0])
    const unclosed = prism('unclosed'); unclosed.geometry.coordinates[0].pop()
    const badHeight = prism('height', 0, { base: 2, height: 2 })
    expect(pickArchitectureAsset(ray, [noId, nan, collapsed, unclosed, badHeight])).toBeNull()
    expect(pickArchitectureAsset({ ...ray, direction: { x: 0, y: 0, z: 0 } }, [prism('good')])).toBeNull()
    expect(pickArchitectureAsset({ ...ray, origin: { x: NaN, y: 0, z: 0 } }, [prism('good')])).toBeNull()
    expect(pickArchitectureAsset(ray, [prism('good')], NaN)).toBeNull()
  })

  it('rejects concave footprints, holes and geometry behind the ray', () => {
    const concave = prism('concave'); concave.geometry.coordinates[0][2] = [0.2, 0.2]
    const hole = prism('hole'); hole.geometry.coordinates.push([[0.2, 0.2], [0.3, 0.2], [0.3, 0.3], [0.2, 0.2]])
    expect(pickArchitectureAsset(ray, [concave, hole, prism('behind', -5)])).toBeNull()
  })
})
