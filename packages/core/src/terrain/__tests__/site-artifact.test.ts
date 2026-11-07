import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '../../types/document'
import type { Road } from '../../types/entities'
import { toLatLng } from '../grid'
import { buildSiteArtifact, createSiteGround, createSiteSurface } from '../site-artifact'
import type { CampusTerrain, TerrainBaseSource, TerrainGrid } from '../types'

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })

function flatBase(h: number): TerrainBaseSource {
  const v = (x: number, y: number): [number, number, number] => {
    const p = ll(x, y)
    return [p.lat, p.lng, h]
  }
  return { kind: 'mesh', vertices: [v(-200, -200), v(200, -200), v(200, 200), v(-200, 200)], triangles: [[0, 1, 2], [0, 2, 3]], sourceNote: 'test' }
}

const terrain = (h: number): CampusTerrain => ({ reference: { name: 'T', zeroMeaning: 'Sea' }, grid, base: flatBase(h), colorRange: { minM: 0, maxM: 40 } })

function road(id: string, from: [number, number], to: [number, number], extra: Partial<Road> = {}): Road {
  return { id, name: id, polyline: { points: [ll(...from), ll(...to)] }, width: 4, surface: 'paved', type: 'road', metadata: {}, ...extra } as unknown as Road
}

const stair = {
  id: 's1', form: 'stairs' as const, presetId: 'plain', width: 2, underneath: 'open' as const, railings: 'both' as const,
  start: { kind: 'ground' as const, position: ll(0, 0) }, end: { kind: 'ground' as const, position: ll(20, 0) },
  heightOverride: { start: 18.34, end: 2 },
}

function doc(fields: Partial<CampusDocument>): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: {}, buildings: [], roads: [], panoramas: [], qrCheckpoints: [],
    boundary: { points: [ll(-10, -10), ll(40, -10), ll(40, 20), ll(-10, 20)] }, ...fields,
  } as unknown as CampusDocument
}

describe('buildSiteArtifact', () => {
  it('no boundary → null', () => {
    expect(buildSiteArtifact(doc({ boundary: undefined }))).toBeNull()
  })

  it('terrain-free campus → terrain null, roads at 0 m', () => {
    const site = buildSiteArtifact(doc({ roads: [road('r1', [0, 5], [30, 5])] }))!
    expect(site.version).toBe(1)
    expect(site.terrain).toBeNull()
    expect(site.roads).toEqual([expect.objectContaining({ id: 'r1', width: 4, startHeightM: 0, endHeightM: 0 })])
  })

  it('follow-surface road reads the stair top', () => {
    const site = buildSiteArtifact(doc({ terrain: terrain(2), structures: [stair], roads: [road('r1', [-10, 0], [0, 0])] }))!
    expect(site.roads[0].endHeightM).toBeCloseTo(18.34, 6)
    expect(site.roads[0].startHeightM).toBeCloseTo(2, 6)
  })

  it('typed road keeps its heights', () => {
    const typed = road('r1', [-10, 0], [0, 0], { heightMode: 'typed', routing: { startElevationMeters: 7, endElevationMeters: 9 } })
    const site = buildSiteArtifact(doc({ terrain: terrain(2), roads: [typed] }))!
    expect(site.roads[0]).toMatchObject({ startHeightM: 7, endHeightM: 9 })
  })

  it('only used presets are included and structures carry resolved heights', () => {
    const presets = ['plain', 'unused'].map((id) => ({
      id, name: id, form: 'stairs' as const, shape: { width: 2, underneath: 'open' as const, railings: 'both' as const },
      look: { tread: 'concrete', side: 'concrete-side', under: 'concrete-under', railing: 'painted-green', railingStyle: 'posts-rails' as const },
    }))
    const site = buildSiteArtifact(doc({ terrain: terrain(2), structures: [stair], structurePresets: presets }))!
    expect(site.presets.map((p) => p.id)).toEqual(['plain'])
    expect(site.structures[0].resolved).toMatchObject({ startHeightM: 18.34, endHeightM: 2 })
    expect(site.structures[0].resolved.path).toHaveLength(2)
  })
})

describe('createSiteSurface', () => {
  it('returns the stair top over a stair and the ground elsewhere', () => {
    const site = buildSiteArtifact(doc({ terrain: terrain(2), structures: [stair] }))!
    const surface = createSiteSurface(site)
    expect(surface(ll(0, 0))).toBeCloseTo(18.34, 2)
    expect(surface(ll(10, 0))).toBeLessThan(18.34)
    expect(surface(ll(10, 0))).toBeGreaterThan(2)
    expect(surface(ll(19.9, 0))).toBeCloseTo(2, 2)
    expect(surface(ll(10, 8))).toBeCloseTo(2, 2)
  })

  it('without terrain the ground is 0 m', () => {
    expect(createSiteSurface(buildSiteArtifact(doc({}))!)(ll(5, 5))).toBe(0)
  })

  it('createSiteGround is the ground only (stairs are not baked into the 3D hill)', () => {
    const site = buildSiteArtifact(doc({ terrain: terrain(2), structures: [stair] }))!
    const ground = createSiteGround(site)
    expect(ground(ll(0, 0))).toBeCloseTo(2, 2)
    expect(ground(ll(10, 0))).toBeCloseTo(2, 2)
    expect(createSiteGround(buildSiteArtifact(doc({}))!)(ll(5, 5))).toBe(0)
  })
})
