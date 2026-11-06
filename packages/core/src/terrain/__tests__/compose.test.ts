import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '../../types/document'
import type { Building } from '../../types/entities'
import { encodeTile, tileIdOf, toLatLng, TILE_CELLS, decodeInt16 } from '../grid'
import { createTerrainSampler, effectiveBuildingBase, followGroundBase, surfaceHeightAt } from '../compose'
import { bakeTerrain } from '../bake'
import { heightsColorStops, CHANGES_COLOR_STOPS } from '../color-scale'
import type { CampusTerrain, TerrainBaseSource, TerrainGrid } from '../types'

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })

/** A plane h = a + b·x over [-200, 200]², as a two-triangle mesh. */
function planeBase(a: number, b: number): TerrainBaseSource {
  const v = (x: number, y: number): [number, number, number] => {
    const p = ll(x, y)
    return [p.lat, p.lng, a + b * x]
  }
  return { kind: 'mesh', vertices: [v(-200, -200), v(200, -200), v(200, 200), v(-200, 200)], triangles: [[0, 1, 2], [0, 2, 3]], sourceNote: 'test' }
}

function terrainOf(base?: TerrainBaseSource): CampusTerrain {
  return { reference: { name: 'Test', zeroMeaning: 'Sea level' }, grid, ...(base ? { base } : {}), colorRange: { minM: 0, maxM: 40 } }
}

function rectFootprint(x0: number, y0: number, x1: number, y1: number) {
  return { points: [ll(x0, y0), ll(x1, y0), ll(x1, y1), ll(x0, y1), ll(x0, y0)] }
}

function building(id: string, footprint: ReturnType<typeof rectFootprint>, extra: Partial<Building> = {}): Building {
  return { id, name: id, code: id, category: 'academic', description: '', footprint, baseElevation: 0, height: 10, floors: [], verticalConnectors: [], color: '#000', aliases: [], metadata: {}, ...extra } as unknown as Building
}

function doc(fields: Partial<CampusDocument>): CampusDocument {
  return { schemaVersion: 1, version: 0, metadata: {}, buildings: [], roads: [], panoramas: [], qrCheckpoints: [], ...fields } as unknown as CampusDocument
}

describe('createTerrainSampler', () => {
  it('no terrain → createTerrainSampler returns null', () => {
    expect(createTerrainSampler(doc({}))).toBeNull()
  })

  it('base + one tile change', () => {
    const cells = new Int16Array(TILE_CELLS * TILE_CELLS)
    cells[5 * TILE_CELLS + 5] = 150
    const sampler = createTerrainSampler(doc({ terrain: terrainOf(planeBase(10, 0)), terrainTiles: { [tileIdOf(0, 0)]: encodeTile(cells) } }))!
    expect(sampler.heightAt(5, 5)).toBeCloseTo(11.5, 6)
    expect(sampler.changeAt(5.5, 5)).toBeCloseTo(0.75, 6)
  })

  it('absent tile means no change', () => {
    const sampler = createTerrainSampler(doc({ terrain: terrainOf(planeBase(10, 0)) }))!
    expect(sampler.changeAt(-300, 900)).toBe(0)
    expect(sampler.heightAt(3, 3)).toBeCloseTo(10, 6)
  })

  it('no base means 0 m ground', () => {
    const sampler = createTerrainSampler(doc({ terrain: terrainOf() }))!
    expect(sampler.heightAt(1, 1)).toBe(0)
  })
})

describe('fits', () => {
  const slope = planeBase(0, 0.5) // 0 m at x=0 → 10 m at x=20
  const pad = (mode: 'both' | 'raise' | 'lower') => building('b1', rectFootprint(0, 0, 20, 10), { ground: { baseMode: 'follow-ground', pad: { mode, blendMeters: 3 } } })

  it('followGroundBase is the mean over the outline', () => {
    const b = pad('both')
    expect(followGroundBase(b, (x) => 0.5 * x, grid)).toBeCloseTo(5, 6)
  })

  it('pad both flattens the outline to the base', () => {
    const d = doc({ terrain: terrainOf(slope), buildings: [pad('both')] })
    const sampler = createTerrainSampler(d)!
    expect(effectiveBuildingBase(d.buildings[0], sampler, grid)).toBeCloseTo(5, 6)
    for (const [x, y] of [[0, 0], [20, 0], [20, 10], [0, 10], [10, 5]]) expect(sampler.heightAt(x, y)).toBeCloseTo(5, 2)
  })

  it('pad blend reaches ground at 3 m', () => {
    const sampler = createTerrainSampler(doc({ terrain: terrainOf(slope), buildings: [pad('both')] }))!
    expect(sampler.heightAt(23, 5)).toBeCloseTo(11.5, 6)
    const mid = sampler.heightAt(21.5, 5)
    expect(mid).toBeGreaterThan(5)
    expect(mid).toBeLessThan(10.75)
  })

  it('pad raise leaves higher ground untouched', () => {
    const sampler = createTerrainSampler(doc({ terrain: terrainOf(slope), buildings: [pad('raise')] }))!
    expect(sampler.heightAt(15, 5)).toBeCloseTo(7.5, 6)
    expect(sampler.heightAt(2, 5)).toBeCloseTo(5, 6)
  })

  it('a fixed building without a pad does not change the ground', () => {
    const sampler = createTerrainSampler(doc({ terrain: terrainOf(slope), buildings: [building('b2', rectFootprint(0, 0, 20, 10), { baseElevation: 3 })] }))!
    expect(sampler.heightAt(15, 5)).toBeCloseTo(7.5, 6)
  })
})

describe('surfaceHeightAt', () => {
  it('reads the top of a stair over the ground', () => {
    const d = doc({
      terrain: terrainOf(planeBase(2, 0)),
      structures: [{
        id: 's1', form: 'ramp', presetId: 'p', width: 2, underneath: 'open', railings: 'none',
        start: { kind: 'ground', position: ll(0, 0) }, end: { kind: 'ground', position: ll(20, 0) },
        heightOverride: { start: 12, end: 2 },
      }],
    })
    const sampler = createTerrainSampler(d)!
    expect(surfaceHeightAt(d, sampler, ll(10, 0))).toBeCloseTo(7, 3)
    expect(surfaceHeightAt(d, sampler, ll(10, 5))).toBeCloseTo(2, 6)
  })
})

describe('bakeTerrain', () => {
  it('bake covers boundary bbox + 20 m', () => {
    const baked = bakeTerrain(doc({ terrain: terrainOf(planeBase(10, 0)), boundary: { points: [ll(0, 0), ll(30, 0), ll(30, 10), ll(0, 10)] } }))!
    expect(baked.cols).toBe(71)
    expect(baked.rows).toBe(51)
    const sw = toLatLng(grid, { x: -20, y: -20 })
    expect(baked.originLat).toBeCloseTo(sw.lat, 7)
    expect(baked.originLng).toBeCloseTo(sw.lng, 7)
  })

  it('bake encodes heights in cm row-major from south-west', () => {
    const baked = bakeTerrain(doc({ terrain: terrainOf(planeBase(1, 0.1)), boundary: { points: [ll(0, 0), ll(30, 0), ll(30, 10), ll(0, 10)] } }))!
    const cells = decodeInt16(baked.heightsCm)
    expect(cells.length).toBe(baked.cols * baked.rows)
    expect(cells[0]).toBe(-100) // x = -20 → 1 + 0.1·(−20) = −1 m
    expect(cells[1]).toBe(-90)
    expect(cells[baked.cols]).toBe(-100) // one row north, same x
    expect(baked.minM).toBeCloseTo(-1, 6)
    expect(baked.maxM).toBeCloseTo(6, 6)
  })

  it('no terrain or no boundary → null', () => {
    expect(bakeTerrain(doc({ boundary: { points: [ll(0, 0), ll(1, 0), ll(1, 1)] } }))).toBeNull()
    expect(bakeTerrain(doc({ terrain: terrainOf() }))).toBeNull()
  })
})

/** Hue (degrees), saturation and lightness (0..1) of a #rrggbb colour. */
function hsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
  return { h: (h + 360) % 360, s, l }
}

describe('color scale', () => {
  it('heightsColorStops spans the campus range', () => {
    expect(heightsColorStops(0, 40).map(([m]) => m)).toEqual([0, 20, 40])
    expect(heightsColorStops(5, 5).map(([m]) => m)).toEqual([5, 5.5, 6])
  })

  it('heights are one calm sand-to-brown scale: no green, no bright colours, darker going up', () => {
    const colours = heightsColorStops(0, 40).map(([, c]) => hsl(c))
    for (const c of colours) {
      expect(c.h).toBeGreaterThanOrEqual(20) // sand / earth hues only (no green, no red)
      expect(c.h).toBeLessThanOrEqual(45)
      expect(c.s).toBeLessThanOrEqual(0.5)
    }
    for (let i = 1; i < colours.length; i++) expect(colours[i].l).toBeLessThan(colours[i - 1].l)
  })

  it('changes are muted: blue lowered, warm raised, clear within ±10 cm', () => {
    const at = (m: number) => CHANGES_COLOR_STOPS.find(([v]) => v === m)?.[1]
    expect(at(-0.1)).toBe('rgba(0,0,0,0)')
    expect(at(0.1)).toBe('rgba(0,0,0,0)')
    const lowered = CHANGES_COLOR_STOPS.filter(([v]) => v <= -0.3).map(([, c]) => hsl(c))
    const raised = CHANGES_COLOR_STOPS.filter(([v]) => v >= 0.3).map(([, c]) => hsl(c))
    for (const c of lowered) expect(c.h).toBeGreaterThan(190)
    for (const c of lowered) expect(c.h).toBeLessThan(230)
    for (const c of raised) expect(c.h).toBeLessThan(30)
    for (const c of [...lowered, ...raised]) expect(c.s).toBeLessThanOrEqual(0.55)
  })
})

describe('structure ends on buildings', () => {
  const hallDoc = (withBuilding: boolean) => {
    const floorAt = (id: string, elevation: number) => ({ id, level: 0, label: id, elevation, height: 3.5, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {} })
    const hall = building('hall', rectFootprint(0, 0, 20, 10), { baseElevation: 12, floors: [floorAt('f1', 0), floorAt('f3', 7)] as never })
    return doc({
      terrain: terrainOf(planeBase(2, 0)),
      buildings: withBuilding ? [hall] : [],
      structures: [{
        id: 's1', form: 'stairs', presetId: 'p', width: 2, underneath: 'open', railings: 'both',
        start: { kind: 'slab', buildingId: 'hall', floorId: 'f3', edgeIndex: 1, edgeT: 0.5, last: { lat: 1, lng: 2, heightM: 18.5 } },
        end: { kind: 'ground', position: ll(40, 5) },
      }],
    })
  }

  it('a slab end sits on the outline edge at base + floor elevation', async () => {
    const { resolveStructureEnds } = await import('../compose')
    const d = hallDoc(true)
    const resolved = resolveStructureEnds(d, createTerrainSampler(d)!, d.structures![0])!
    expect(resolved.start.x).toBeCloseTo(20, 3)
    expect(resolved.start.y).toBeCloseTo(5, 3)
    expect(resolved.start.h).toBeCloseTo(19, 6)
    expect(resolved.orphanStart).toBe(false)
  })

  it('building move → the slab end follows the outline', async () => {
    const { resolveStructureEnds } = await import('../compose')
    const d = hallDoc(true)
    d.buildings[0].footprint = rectFootprint(10, 0, 30, 10)
    const resolved = resolveStructureEnds(d, createTerrainSampler(d)!, d.structures![0])!
    expect(resolved.start.x).toBeCloseTo(30, 3)
  })

  it('deleted building → the start keeps its last position and height and is marked', async () => {
    const { resolveStructureEnds } = await import('../compose')
    const d = hallDoc(false)
    const resolved = resolveStructureEnds(d, createTerrainSampler(d)!, d.structures![0])!
    expect(resolved.start.h).toBe(18.5)
    expect(resolved.orphanStart).toBe(true)
  })
})

describe('structureTopAt for ramps', () => {
  it('a ramp top is level across its landing', async () => {
    const { structureTopAt } = await import('../compose')
    const ramp = { id: 'r', form: 'ramp', presetId: 'plain-ramp', width: 1.5, underneath: 'solid', railings: 'both', landings: [0.5],
      start: { kind: 'ground', position: ll(0, 0) }, end: { kind: 'ground', position: ll(12, 0) } } as never
    const resolved = { start: { x: 0, y: 0, h: 10 }, end: { x: 12, y: 0, h: 11 }, orphanStart: false, orphanEnd: false }
    expect(structureTopAt(ramp, resolved, 12, 6)).toBeCloseTo(10.5, 9)
    expect(structureTopAt(ramp, resolved, 12, 5.5)).toBeCloseTo(10.5, 9)
    expect(structureTopAt(ramp, resolved, 12, 2.625)).toBeCloseTo(10.25, 9)
  })
})

describe('stair end offsets (Shift+Z, owner 2026-11-07: "offset, keeps following")', () => {
  const stairOn = (base: number, extra: Record<string, unknown> = {}) => {
    const d = doc({ terrain: terrainOf(planeBase(base, 0)) })
    const structure = {
      id: 's', form: 'stairs', presetId: 'p', width: 2, underneath: 'open', railings: 'both',
      start: { kind: 'ground', position: ll(0, 0) }, end: { kind: 'road', roadId: 'r', position: ll(10, 0) }, ...extra,
    }
    return { d, structure }
  }

  it('a ground or road end sits its offset above the surface and keeps following it', async () => {
    const { resolveStructureEnds } = await import('../compose')
    for (const ground of [2, 7]) {
      const { d, structure } = stairOn(ground, { heightOffset: { start: 0.3, end: -0.2 } })
      const r = resolveStructureEnds(d, createTerrainSampler(d)!, structure as never)!
      expect(r.start.h).toBeCloseTo(ground + 0.3, 6)
      expect(r.end.h).toBeCloseTo(ground - 0.2, 6)
    }
  })

  it('a typed height (heightOverride) still wins over the offset', async () => {
    const { resolveStructureEnds } = await import('../compose')
    const { d, structure } = stairOn(2, { heightOffset: { start: 0.3 }, heightOverride: { start: 9 } })
    expect(resolveStructureEnds(d, createTerrainSampler(d)!, structure as never)!.start.h).toBeCloseTo(9, 6)
  })
})

