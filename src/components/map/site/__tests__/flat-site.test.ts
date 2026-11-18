import { describe, expect, it } from 'vitest'
import type { SiteArtifact } from '@navi/core'
import { flatSite, routeAsRibbon } from '../flat-site'

const site = {
  boundary: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }],
  terrain: { originLat: 0, originLng: 0 } as never,
  buildings: [{ id: 'b', baseM: 7.99 }, { id: 'c', baseM: 0 }],
  structures: [{ id: 'hill-stair' }],
  roads: [{ id: 'r' }],
  look: 'terraces',
} as unknown as SiteArtifact

describe('NAVI Web on flat ground (Thursday, owner 2026-11-16)', () => {
  it('drops the terrain, stands every building on the ground and leaves out hillside stairs', () => {
    const flat = flatSite(site)!
    expect(flat.terrain).toBeUndefined()
    expect(flat.buildings.map((b) => b.baseM)).toEqual([0, 0])
    expect(flat.structures).toEqual([])
  })

  it('keeps the campus boundary, roads and look; does not change the published site', () => {
    const flat = flatSite(site)!
    expect(flat.boundary).toBe(site.boundary)
    expect((flat as unknown as { roads: unknown }).roads).toBe((site as unknown as { roads: unknown }).roads)
    expect(site.buildings[0].baseM).toBe(7.99)
    expect(flatSite(undefined)).toBeUndefined()
  })
})

describe('ground preference (flat by default; terrain only when chosen)', () => {
  it('keeps a valid ground choice and drops anything else', async () => {
    const { mergePublicPreferences } = await import('@/lib/public-preferences')
    expect(mergePublicPreferences({ ground: 'terrain' } as never).ground).toBe('terrain')
    expect(mergePublicPreferences({ ground: 'hills' } as never)).not.toHaveProperty('ground')
    expect(mergePublicPreferences({} as never)).not.toHaveProperty('ground')
  })
})

describe('routeAsRibbon (owner 2026-11-18: a bold route line on flat ground)', () => {
  it('only a tilted campus with terrain draws the route as a ribbon on the surface', () => {
    expect(routeAsRibbon({ terrain: { heights: [] } } as never, true)).toBe(true)
    expect(routeAsRibbon({ terrain: { heights: [] } } as never, false)).toBe(false)
    expect(routeAsRibbon({ terrain: null } as never, true)).toBe(false)
    expect(routeAsRibbon(undefined, true)).toBe(false)
  })
})
