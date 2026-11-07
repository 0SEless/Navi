import { describe, expect, it } from 'vitest'
import { buildSiteArtifact, toLatLng, type CampusDocument, type SiteArtifact } from '@navi/core'
import { siteContourLines, siteGroundArea, siteSlabFeatures, siteStructuresMesh } from '../site-data'

const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })

function plane(h: (x: number) => number) {
  const v = (x: number, y: number): [number, number, number] => {
    const p = ll(x, y)
    return [p.lat, p.lng, h(x)]
  }
  return { kind: 'mesh' as const, vertices: [v(-200, -200), v(200, -200), v(200, 200), v(-200, 200)], triangles: [[0, 1, 2], [0, 2, 3]] as Array<[number, number, number]>, sourceNote: 'test' }
}

const stair = (id: string, y: number) => ({
  id, form: 'stairs' as const, presetId: 'plain-stair', width: 2, underneath: 'open' as const, railings: 'both' as const,
  start: { kind: 'ground' as const, position: ll(0, y) }, end: { kind: 'ground' as const, position: ll(20, y) },
  heightOverride: { start: 6, end: 2 },
})

function site(structures = [stair('s1', 0)], slope = (x: number) => 2 + x * 0.1): SiteArtifact {
  return buildSiteArtifact({
    schemaVersion: 1, version: 0, metadata: { campusId: 'c' }, panoramas: [], qrCheckpoints: [], roads: [],
    buildings: [{ id: 'hall', name: 'Hall', footprint: { points: [ll(40, 0), ll(60, 0), ll(60, 10), ll(40, 10), ll(40, 0)] }, baseElevation: 7, floors: [], ground: { baseMode: 'fixed' } }],
    boundary: { points: [ll(-50, -50), ll(100, -50), ll(100, 50), ll(-50, 50)] },
    terrain: { reference: { name: 'T', zeroMeaning: 'Sea' }, grid, base: plane(slope), colorRange: { minM: 0, maxM: 40 } },
    structures,
  } as unknown as CampusDocument)!
}

const hall = { id: 'hall', name: 'Hall', campusId: 'c', floors: [1, 2, 3], footprint: [ll(40, 0), ll(60, 0), ll(60, 10), ll(40, 10)], baseElevation: 0, height: 10.5 }

describe('NAVI Web site data', () => {
  it('stairs and ramps: one mesh with every structure (more structures, more vertices)', () => {
    const one = siteStructuresMesh(site())
    const two = siteStructuresMesh(site([stair('s1', 0), stair('s2', 20)]))
    expect(one.mesh.length).toBeGreaterThan(0)
    expect(one.mesh.length % 9).toBe(0)
    expect(two.mesh.length).toBeGreaterThan(one.mesh.length)
    expect(one.origin).toEqual({ lat: site().terrain!.originLat, lng: site().terrain!.originLng })
  })

  it('building slabs: one per floor plus the roof, from the published base, relative to the ground under the centre', () => {
    const fc = siteSlabFeatures(site(), [hall as never])
    expect(fc.features).toHaveLength(4)
    // Base 7 m (Fixed); ground at the centre (x 50) is 7 m; floors 3.5 m apart.
    const tops = fc.features.map((f) => Math.round((f.properties!.top as number) * 100) / 100 + 0)
    // The ground floor is at least one slab thick (a zero-height slab flickers in the ground surface).
    expect(tops).toEqual([0.25, 3.5, 7, 10.5])
  })

  it('contour lines every 5 m, and the campus ground area is the boundary', () => {
    const lines = siteContourLines(site(undefined, (x) => x * 0.2), 5)
    expect(lines.features.length).toBeGreaterThan(0)
    for (const f of lines.features) expect((f.properties!.elevation as number) % 5).toBeCloseTo(0, 6)
    const area = siteGroundArea(site())
    expect((area.geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(5)
  })
})
