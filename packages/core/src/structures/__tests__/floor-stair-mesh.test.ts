import { describe, expect, it } from 'vitest'
import { floorStairMesh } from '../floor-stair-mesh'
import type { StairAssetInput } from '../../geometry/stair-assets'

const u = (sides: 'open' | 'railing' | 'wall'): StairAssetInput => ({
  id: 'u', position: { x: 0, y: 0 }, rotation: 0, height: 3.5,
  drawing: { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'ushape', sides } },
})
const heights = (mesh: Float32Array) => { const z: number[] = []; for (let i = 2; i < mesh.length; i += 9) z.push(mesh[i]); return z }
const xs = (mesh: Float32Array) => { const x: number[] = []; for (let i = 0; i < mesh.length; i += 9) x.push(mesh[i]); return x }

describe('smooth floor stairs (mesh)', () => {
  it('a U-Shape stair becomes one mesh from its floor up to the full climb, inside its footprint', () => {
    const mesh = floorStairMesh([u('open')], 0, (p) => p)
    expect(mesh.length).toBeGreaterThan(0)
    expect(mesh.length % 9).toBe(0)
    const z = heights(mesh)
    expect(Math.max(...z)).toBeGreaterThanOrEqual(3.5 - 1e-6)
    expect(Math.max(...z)).toBeLessThan(3.6)
    const x = xs(mesh)
    expect(Math.min(...x)).toBeGreaterThan(-2.1 - 1.2 - 0.05) // the top platform runs 1.2 m past the start edge
    expect(Math.max(...x)).toBeLessThan(2.2 + 1.3)
  })

  it('solid sides rise about a metre above the treads; open sides add nothing above', () => {
    const wall = Math.max(...heights(floorStairMesh([u('wall')], 0, (p) => p)))
    expect(wall).toBeGreaterThan(4.2)
    expect(wall).toBeLessThan(4.7)
  })

  it('stands on its floor: the whole mesh is lifted by the floor base', () => {
    const z0 = heights(floorStairMesh([u('open')], 0, (p) => p))
    const z7 = heights(floorStairMesh([u('open')], 7, (p) => p))
    expect(Math.max(...z7) - Math.max(...z0)).toBeCloseTo(7, 6)
  })

  it('places points through the given conversion (building-local → map metres)', () => {
    const shifted = xs(floorStairMesh([u('open')], 0, (p) => ({ x: p.x + 100, y: p.y })))
    expect(Math.min(...shifted)).toBeGreaterThan(100 - 3.35)
  })
})

describe('smooth floor stairs never break drawing', () => {
  it('an impossible conversion (kilometres long) draws nothing instead of throwing', () => {
    expect(floorStairMesh([u('wall')], 0, (p) => ({ x: p.x * 100000, y: p.y * 100000 })).length).toBe(0)
  })
})
