import { describe, expect, it } from 'vitest'
import { floorStairMesh } from '../floor-stair-mesh'
import { buildStairAssetVolumes } from '../../geometry/stair-assets'
import { BUILT_IN_MATERIALS } from '../materials'
import type { StairAssetInput } from '../../geometry/stair-assets'

// Owner 2026-11-17: Stair-tool stairs looked hollow and plain — "a cement that is a slant … 50% or 70% of the railing
// will be cemented, then there will be a railing", and "put a block there … to make it look like it is a block".

const rgb = (id: string) => {
  const hex = (BUILT_IN_MATERIALS[id]?.color ?? '#999999').replace('#', '')
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
}
const SIDE = rgb('concrete-side')
const RAIL = rgb('painted-green')
type Vertex = { x: number; y: number; z: number; c: number[] }
const vertices = (mesh: Float32Array): Vertex[] => {
  const out: Vertex[] = []
  for (let i = 0; i < mesh.length; i += 9) out.push({ x: mesh[i], y: mesh[i + 1], z: mesh[i + 2], c: [mesh[i + 6], mesh[i + 7], mesh[i + 8]] })
  return out
}
const is = (c: number[], target: number[]) => c.every((v, i) => Math.abs(v - target[i]) < 1e-3)

// A Stair-tool stair: outline only (1.2 m wide, 6 m long, climbing east), no design; 3.5 m rise.
const toolStair = (extra: Partial<StairAssetInput> = {}): StairAssetInput => ({
  id: 't', position: { x: 3, y: 0 }, rotation: 0, height: 3.5,
  polygon: { points: [{ x: 0, y: 0.6 }, { x: 0, y: -0.6 }, { x: 6, y: -0.6 }, { x: 6, y: 0.6 }] },
  ...extra,
} as StairAssetInput)
/** Height of the stair's slope line at x (0 → 3.5 over 0–6 m). */
const slope = (x: number) => Math.min(3.5, Math.max(0, (x / 6) * 3.5))

describe('Stair-tool stairs: half wall with a rail on both sides by default', () => {
  const v = vertices(floorStairMesh([toolStair()], 0, (p) => p))

  it('a concrete wall rises above the steps along both sides, about 0.6 m above the slope', () => {
    const wallTop = v.filter((p) => is(p.c, SIDE) && p.x > 1 && p.x < 5 && p.z - slope(p.x) > 0.3)
    expect(wallTop.some((p) => p.y > 0)).toBe(true)
    expect(wallTop.some((p) => p.y < 0)).toBe(true)
    for (const p of wallTop) expect(p.z - slope(p.x)).toBeLessThan(0.75)
  })

  it('a metal rail runs on top of the wall, at railing height', () => {
    const rail = v.filter((p) => is(p.c, RAIL) && p.x > 1 && p.x < 5)
    expect(rail.length).toBeGreaterThan(0)
    expect(Math.max(...rail.map((p) => p.z - slope(p.x)))).toBeGreaterThan(0.9)
    // No mid rail: below the wall top the side is concrete.
    expect(rail.every((p) => p.z - slope(p.x) > 0.5)).toBe(true)
  })

  it('a look on the stair changes it: no railings', () => {
    const plain = vertices(floorStairMesh([toolStair({ look: { railings: 'none' } })], 0, (p) => p))
    expect(plain.some((p) => is(p.c, RAIL))).toBe(false)
    expect(plain.some((p) => is(p.c, SIDE) && p.x > 1 && p.x < 5 && p.z - slope(p.x) > 0.3)).toBe(false)
  })

  it('Solid wall: concrete up to railing height and no metal', () => {
    const wall = vertices(floorStairMesh([toolStair({ look: { railingStyle: 'wall' } })], 0, (p) => p))
    expect(wall.some((p) => is(p.c, RAIL))).toBe(false)
    expect(Math.max(...wall.filter((p) => is(p.c, SIDE) && p.x > 1 && p.x < 5).map((p) => p.z - slope(p.x)))).toBeGreaterThan(0.9)
  })
})

describe('designed stairs keep their look', () => {
  it('a designed stair without railings chosen still has none', () => {
    const designed: StairAssetInput = { id: 'd', position: { x: 0, y: 0 }, rotation: 0, height: 3.5,
      drawing: { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'straight' } } } as StairAssetInput
    expect(vertices(floorStairMesh([designed], 0, (p) => p)).some((p) => is(p.c, RAIL))).toBe(false)
  })

  it('a designed stair with Half wall + rail gets the wall too', () => {
    const designed: StairAssetInput = { id: 'd', position: { x: 3, y: 0 }, rotation: 0, height: 3.5,
      drawing: { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'straight', railings: 'both', railingStyle: 'half-wall' } } } as StairAssetInput
    const v = vertices(floorStairMesh([designed], 0, (p) => p))
    expect(v.some((p) => is(p.c, RAIL))).toBe(true)
    // Compared with the same stair without railings, at the same spot along it: concrete rises 0.3–0.75 m higher.
    const bare = vertices(floorStairMesh([{ ...designed, drawing: { ...designed.drawing!, properties: { ...designed.drawing!.properties, railings: 'none' } } }], 0, (p) => p))
    const bareTop = (x: number) => Math.max(...bare.filter((q) => Math.abs(q.x - x) < 0.2).map((q) => q.z))
    const above = v.filter((p) => is(p.c, SIDE)).map((p) => p.z - bareTop(p.x)).filter(Number.isFinite)
    expect(above.some((d) => d > 0.3 && d < 0.75)).toBe(true)
  })
})

describe('outside stairs stand on the ground, not hollow (owner 2026-11-17)', () => {
  it('a stair outside the walls on an upper floor is solid down to the ground', () => {
    const mesh = vertices(floorStairMesh([toolStair({ outside: true })], 3.5, (p) => p, 0))
    expect(Math.min(...mesh.map((p) => p.z))).toBeLessThan(0.01)
  })

  it('a stair inside the building stops at its own floor', () => {
    const mesh = vertices(floorStairMesh([toolStair()], 3.5, (p) => p, 0))
    expect(Math.min(...mesh.map((p) => p.z))).toBeGreaterThan(3)
  })
})

describe('a solid stair is closed at both ends (owner 2026-11-17: "you can see the inside of the stair")', () => {
  // Triangles facing along the run (normal mostly ±x), in the concrete side colour.
  const endFaces = (mesh: Float32Array) => {
    const out: Array<{ x: number; zMin: number; zMax: number }> = []
    for (let i = 0; i < mesh.length; i += 27) {
      const nx = (mesh[i + 3] + mesh[i + 12] + mesh[i + 21]) / 3
      const c = [mesh[i + 6], mesh[i + 7], mesh[i + 8]]
      if (Math.abs(nx) < 0.9 || !is(c, SIDE)) continue
      const z = [mesh[i + 2], mesh[i + 11], mesh[i + 20]]
      out.push({ x: (mesh[i] + mesh[i + 9] + mesh[i + 18]) / 3, zMin: Math.min(...z), zMax: Math.max(...z) })
    }
    return out
  }

  it('the high end has a full-height back face from the ground to the top step', () => {
    const faces = endFaces(floorStairMesh([toolStair({ look: { railings: 'none' } })], 0, (p) => p))
    const high = faces.filter((f) => f.x > 5.5)
    expect(high.some((f) => f.zMin < 0.01 && f.zMax > 3.4)).toBe(true)
  })

  it('an open-underneath stair stays open (no back wall)', () => {
    const faces = endFaces(floorStairMesh([toolStair({ look: { railings: 'none', underneath: 'open' } })], 0, (p) => p))
    expect(faces.some((f) => f.x > 5.5 && f.zMin < 0.5 && f.zMax > 3.4)).toBe(false)
  })
})

describe('the U-stair turn platform gets a railing on its open edges (owner 2026-11-17 sketch)', () => {
  const uStair = (extra: Record<string, unknown> = {}): StairAssetInput => ({
    id: 'u', position: { x: 0, y: 0 }, rotation: 0, height: 3.5,
    drawing: { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'ushape', turn: 'right', railings: 'both', ...extra } },
  } as StairAssetInput)
  // The turn platform and its far edge (the one farthest from the steps), from the same layout the mesh uses.
  const platform = () => {
    const solids = buildStairAssetVolumes([uStair()], 0).collection.features
    const landing = solids.find((f) => f.properties?.partType === 'landing')!
    const ring = (landing.geometry.coordinates[0] as number[][]).slice(0, 4)
    const steps = solids.filter((f) => f.properties?.partType === 'step').flatMap((f) => f.geometry.coordinates[0] as number[][])
    const c = [steps.reduce((n, p) => n + p[0], 0) / steps.length, steps.reduce((n, p) => n + p[1], 0) / steps.length]
    const edges = ring.map((a, i) => [a, ring[(i + 1) % 4]])
    const far = edges.sort((e1, e2) => Math.hypot((e2[0][0] + e2[1][0]) / 2 - c[0], (e2[0][1] + e2[1][1]) / 2 - c[1]) - Math.hypot((e1[0][0] + e1[1][0]) / 2 - c[0], (e1[0][1] + e1[1][1]) / 2 - c[1]))[0]
    return { h: Number(landing.properties!.height), far }
  }
  const nearFar = (p: Vertex, far: number[][], ends = false) => {
    const [a, b] = far, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
    const t = ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / (len * len)
    return (ends ? t > -0.05 && t < 1.05 : t > 0.1 && t < 0.9) && Math.abs(-(p.x - a[0]) * dy + (p.y - a[1]) * dx) / len < 0.2
  }

  it('posts and rails along the far edge, at railing height above the platform', () => {
    const { h, far } = platform()
    const v = vertices(floorStairMesh([uStair({ railingStyle: 'posts-rails' })], 0, (p) => p))
    expect(v.some((p) => is(p.c, RAIL) && nearFar(p, far) && p.z > h + 0.85 && p.z < h + 1.05)).toBe(true)
  })

  it('Platform railing: Half wall + rail puts concrete there even on a metal-railed stair', () => {
    const { h, far } = platform()
    const v = vertices(floorStairMesh([uStair({ railingStyle: 'posts-rails', platformRailingStyle: 'half-wall' })], 0, (p) => p))
    expect(v.some((p) => is(p.c, SIDE) && nearFar(p, far, true) && p.z > h + 0.55 && p.z < h + 0.65)).toBe(true)
  })

  it('Platform railing: None leaves it open', () => {
    const { h, far } = platform()
    const v = vertices(floorStairMesh([uStair({ platformRailingStyle: 'none' })], 0, (p) => p))
    expect(v.some((p) => nearFar(p, far, true) && p.z > h + 0.3)).toBe(false)
  })
})
