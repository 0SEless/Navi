import { describe, expect, it } from 'vitest'
import { floorStairMesh } from '../floor-stair-mesh'
import { buildStairAssetVolumes, type StairAssetInput, type StairTopInput } from '../../geometry/stair-assets'

const vertices = (mesh: Float32Array) => { const v: Array<[number, number, number]> = []; for (let i = 0; i < mesh.length; i += 9) v.push([mesh[i], mesh[i + 1], mesh[i + 2]]); return v }
const inside = (p: [number, number, number], ring: number[][], pad = -0.05) => {
  const xs = ring.map((q) => q[0]), ys = ring.map((q) => q[1])
  return p[0] > Math.min(...xs) - pad && p[0] < Math.max(...xs) + pad && p[1] > Math.min(...ys) - pad && p[1] < Math.max(...ys) + pad
}

describe('U-Shape with Underneath Open is hollow (owner 2026-11-19, ASU Tourism)', () => {
  const u = (underneath: 'open' | 'solid'): StairAssetInput => ({
    id: 'u', position: { x: 0, y: 0 }, rotation: 0, height: 3.5,
    drawing: { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'ushape', railings: 'both', underneath } },
  })
  const landing = buildStairAssetVolumes([u('open')], 0).collection.features.find((f) => f.properties?.partType === 'landing')!
  const ring = landing.geometry.coordinates[0] as number[][]
  const h = Number(landing.properties!.height)

  it('nothing under the turning landing reaches down to the floor', () => {
    const under = vertices(floorStairMesh([u('open')], 0, (p) => p)).filter((p) => inside(p, ring, 0.02) && p[2] < h - 0.6)
    expect(under).toEqual([])
  })

  it('Solid still stands the turning landing on a block down to the floor', () => {
    const under = vertices(floorStairMesh([u('solid')], 0, (p) => p)).filter((p) => inside(p, ring, 0.02) && p[2] < 0.05)
    expect(under.length).toBeGreaterThan(0)
  })
})

describe('entry and exit platforms railed or flat (owner 2026-11-19)', () => {
  // A Stair-tool stair (outline only) climbing north from y = 0 at x 0..1.2 (first edge = bottom step), on an upper
  // floor, with an entry platform behind its foot (y -1.2..0).
  const flight = (look: Record<string, unknown>): StairAssetInput => ({
    id: 's', position: { x: 0.6, y: 2 }, rotation: 0, height: 3.5, look: { railings: 'both', ...look } as never,
    polygon: { points: [{ x: 1.2, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 4 }, { x: 1.2, y: 4 }] },
    entryPlatform: { ring: [{ x: 1.2, y: 0 }, { x: 0, y: 0 }, { x: 0, y: -1.2 }, { x: 1.2, y: -1.2 }], railed: [false, true, false, true] },
  } as never)
  const pad = [[0, -1.2], [1.2, -1.2], [1.2, 0], [0, 0]]
  const railsOnPad = (look: Record<string, unknown>) => vertices(floorStairMesh([flight(look)], 3.5, (p) => p)).filter((p) => inside(p, pad, 0.02) && p[1] < -0.1 && p[2] > 3.5 + 0.3)

  it('Entry platform: Flat by default — no railing round it', () => {
    expect(railsOnPad({})).toEqual([])
  })

  it('Entry platform: Railing — railings on its open sides', () => {
    expect(railsOnPad({ entryRailing: 'railing' }).length).toBeGreaterThan(0)
  })

  const top = (look: Record<string, unknown>): StairTopInput => ({
    id: 's', position: { x: 0.6, y: 2 }, rotation: 0, height: 3.5, fromLevel: 0, look: { railings: 'both', ...look } as never,
    polygon: { points: [{ x: 1.2, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 4 }, { x: 1.2, y: 4 }] },
  } as never)
  const guards = (look: Record<string, unknown>) => vertices(floorStairMesh([], 3.5, (p) => p, 3.5, [top(look)]))

  it('Exit platform: Railing by default — a guard round the arrival', () => {
    expect(guards({}).length).toBeGreaterThan(0)
  })

  it('Exit platform: Flat — no guard railing', () => {
    expect(guards({ exitRailing: 'flat' })).toEqual([])
  })
})
