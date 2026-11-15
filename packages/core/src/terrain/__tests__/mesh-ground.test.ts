import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '../../types/document'
import type { Building } from '../../types/entities'
import { encodeTile, tileIdOf, toLatLng, TILE_CELLS } from '../grid'
import { createTerrainSampler } from '../compose'
import { bakeTerrain } from '../bake'
import { createHeightField } from '../height-field'
import { levelMesh, newMesh, nudgePoints, type TerrainMesh } from '../mesh'
import type { CampusTerrain, TerrainBaseSource, TerrainGrid } from '../types'

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })

/** Bumpy slope h = 0.2x + sin bumps, as a fine mesh over [-100, 100]². */
function bumpyBase(): TerrainBaseSource {
  const vertices: Array<[number, number, number]> = []
  const triangles: Array<[number, number, number]> = []
  const n = 40
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = -100 + (200 * i) / n
    const y = -100 + (200 * j) / n
    const p = ll(x, y)
    vertices.push([p.lat, p.lng, 10 + 0.2 * x + Math.sin(x / 7) * 1.5 + Math.cos(y / 5)])
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i
    triangles.push([a, a + 1, a + n + 2], [a, a + n + 2, a + n + 1])
  }
  return { kind: 'mesh', vertices, triangles, sourceNote: 'test' }
}

function doc(meshes?: TerrainMesh[], extra: Partial<CampusTerrain> = {}, fields: Partial<CampusDocument> = {}): CampusDocument {
  const terrain: CampusTerrain = { reference: { name: 'T', zeroMeaning: 'Sea' }, grid, base: bumpyBase(), colorRange: { minM: 0, maxM: 40 }, ...(meshes ? { meshes } : {}), ...extra }
  return {
    schemaVersion: 1, version: 0, metadata: {}, buildings: [], roads: [], panoramas: [], qrCheckpoints: [],
    boundary: { points: [ll(-60, -60), ll(60, -60), ll(60, 60), ll(-60, 60)] }, terrain, ...fields,
  } as unknown as CampusDocument
}

const square = (x0: number, y0: number, x1: number, y1: number) => [ll(x0, y0), ll(x1, y0), ll(x1, y1), ll(x0, y1)]
const samples = (n: number, span = 50) => Array.from({ length: n }, (_, i) => ({ x: ((i * 37) % (2 * span)) - span, y: ((i * 53) % (2 * span)) - span }))
const allZ = (mesh: TerrainMesh, z: number) => ({ ...mesh, z: mesh.z.map(() => z) })

describe('meshes in the ground', () => {
  it('no meshes, or an empty list, gives exactly today\'s ground', () => {
    const plain = createTerrainSampler(doc())!
    const empty = createTerrainSampler(doc([]))!
    for (const p of samples(300)) expect(empty.heightAt(p.x, p.y)).toBe(plain.heightAt(p.x, p.y))
  })

  it('a new mesh changes nothing', () => {
    const plain = createTerrainSampler(doc())!
    const with1 = createTerrainSampler(doc([newMesh('a', 'A', square(-20, -20, 20, 20), grid)]))!
    for (const p of samples(50, 20)) expect(with1.heightAt(p.x, p.y)).toBeCloseTo(plain.heightAt(p.x, p.y), 9)
  })

  it('keep bumps: lifts the ground (bumps intact) inside, never touches outside or the outline', () => {
    const plain = createTerrainSampler(doc())!
    const mesh = allZ(newMesh('a', 'A', square(-20, -20, 20, 20), grid), 2)
    const s = createTerrainSampler(doc([mesh]))!
    for (const p of [{ x: 0, y: 0 }, { x: 10, y: -12 }, { x: -15, y: 15 }]) expect(s.heightAt(p.x, p.y)).toBeCloseTo(plain.heightAt(p.x, p.y) + 2, 6)
    for (const p of [{ x: 21, y: 0 }, { x: 40, y: 40 }, { x: 20, y: 5 }, { x: -20, y: -3 }]) expect(s.heightAt(p.x, p.y)).toBe(plain.heightAt(p.x, p.y))
  })

  it('smooth out: a levelled mesh is exactly flat inside', () => {
    const mesh = levelMesh(newMesh('a', 'A', square(-20, -20, 20, 20), grid), 5, () => 0, grid)
    const s = createTerrainSampler(doc([mesh]))!
    for (const p of [{ x: 0, y: 0 }, { x: 15, y: -15 }, { x: -12, y: 8 }]) expect(s.heightAt(p.x, p.y)).toBeCloseTo(5, 6)
  })

  it('overlapping meshes: the later one in the list wins inside both', () => {
    const a = levelMesh(newMesh('a', 'A', square(-30, -30, 10, 10), grid), 3, () => 0, grid)
    const b = levelMesh(newMesh('b', 'B', square(-10, -10, 30, 30), grid), 7, () => 0, grid)
    expect(createTerrainSampler(doc([a, b]))!.heightAt(0, 0)).toBeCloseTo(7, 6)
    expect(createTerrainSampler(doc([b, a]))!.heightAt(0, 0)).toBeCloseTo(3, 6)
  })

  it('a building stays on its own floor over a mesh', () => {
    const mesh = allZ(newMesh('a', 'A', square(-40, -40, 40, 40), grid), 6)
    const b = { id: 'b1', name: 'b1', footprint: { points: [...square(-5, -5, 5, 5), ll(-5, -5)] }, baseElevation: 1, ground: { baseMode: 'fixed', pad: { mode: 'both', blendMeters: 2 } }, floors: [], metadata: {} } as unknown as Building
    const s = createTerrainSampler(doc([mesh], {}, { buildings: [b] }))!
    expect(s.heightAt(0, 0)).toBeCloseTo(1, 6)
  })

  it('the Mesh tool\'s draft replaces the saved meshes', () => {
    const saved = allZ(newMesh('a', 'A', square(-20, -20, 20, 20), grid), 2)
    const draft = allZ(saved, 4)
    const plain = createTerrainSampler(doc())!
    expect(createTerrainSampler(doc([saved]), { meshesOverride: [draft] })!.heightAt(0, 0)).toBeCloseTo(plain.heightAt(0, 0) + 4, 6)
  })

  it('hidden meshes and hidden Sculpting are hidden only in Studio\'s view; the bake always includes them', () => {
    const mesh = { ...allZ(newMesh('a', 'A', square(-20, -20, 20, 20), grid), 2), hidden: true }
    const cells = new Int16Array(TILE_CELLS * TILE_CELLS).fill(150)
    const tiles = { [tileIdOf(0, 0)]: encodeTile(cells) }
    const hidden = doc([mesh], { sculptingHidden: true }, { terrainTiles: tiles })
    const shown = doc([{ ...mesh, hidden: false }], { sculptingHidden: false }, { terrainTiles: tiles })
    const plainTiled = createTerrainSampler(doc(undefined, {}, { terrainTiles: tiles }))!
    expect(createTerrainSampler(hidden)!.heightAt(5, 5)).toBeCloseTo(plainTiled.heightAt(5, 5) + 2, 6)
    expect(createTerrainSampler(hidden, { studioView: true })!.heightAt(5, 5)).toBeCloseTo(createTerrainSampler(doc())!.heightAt(5, 5), 6)
    expect(bakeTerrain(hidden)).toEqual(bakeTerrain(shown))
  })

  it('a bad stored mesh is skipped: same ground, no error', () => {
    const bad = { ...newMesh('a', 'A', square(-20, -20, 20, 20), grid), z: [1, 2] }
    const plain = createTerrainSampler(doc())!
    const s = createTerrainSampler(doc([bad as TerrainMesh]))!
    for (const p of samples(20, 20)) expect(s.heightAt(p.x, p.y)).toBe(plain.heightAt(p.x, p.y))
  })

  it('far from every mesh, 30 meshes leave the ground exactly as it is', () => {
    const many = Array.from({ length: 30 }, (_, i) => allZ(newMesh(`m${i}`, 'M', square(-55, -55 + i, -54, -54 + i), grid), 3))
    const plain = createTerrainSampler(doc())!
    const s = createTerrainSampler(doc(many))!
    for (const p of samples(200, 40).map((p) => ({ x: p.x + 5, y: p.y }))) expect(s.heightAt(p.x, p.y)).toBe(plain.heightAt(p.x, p.y))
  })

  it('the height field follows a mesh after updating its area', () => {
    const before = doc()
    const field = createHeightField(before)!
    const mesh = nudgePoints(newMesh('a', 'A', square(-20, -20, 20, 20), grid), grid, [{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }, { row: 2, col: 2 }], 3, 0)
    const after = doc([mesh])
    field.update(after, { minX: -21, minY: -21, maxX: 21, maxY: 21 })
    const s = createTerrainSampler(after)!
    for (const p of [{ x: 0, y: 0 }, { x: 5, y: -3 }, { x: -10, y: 10 }]) expect(field.heightAt(p.x, p.y)).toBeCloseTo(s.heightAt(p.x, p.y), 1)
  })

  it('the height field also refreshes the floor of a building without a pad', () => {
    const b = { id: 'b1', name: 'b1', footprint: { points: [...square(10, 10, 20, 20), ll(10, 10)] }, baseElevation: 30, ground: { baseMode: 'fixed', pad: { mode: 'off', blendMeters: 3 } }, floors: [], metadata: {} } as unknown as Building
    const d = doc(undefined, {}, { buildings: [b] })
    const field = createHeightField(doc())!
    field.update(d, { minX: 9, minY: 9, maxX: 12, maxY: 12 })
    expect(field.heightAt(15, 15)).toBeCloseTo(createTerrainSampler(d)!.heightAt(15, 15), 1)
  })
})
