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

describe('outside stair: open into its doorway, landing at its foot (owner 2026-11-17)', () => {
  // Straight stair climbing west from x = +3 to x = -3 (20 × 0.3 m), 1.5 m wide (y -0.75..0.75), railings both
  // sides; top platform x -3..-5. Its doorway is south of the platform (a wall at y < 0).
  const outside = (doorwayAt?: { x: number; y: number }): StairAssetInput => ({
    id: 'o', position: { x: 0, y: 0 }, rotation: 90, height: 3.5, ...(doorwayAt ? { doorwayAt } : {}),
    drawing: { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.5, stepDepth: 0.3, direction: 'south', preset: 'straight', sides: 'railing', topLandingM: 2 } },
  })
  const vertices = (mesh: Float32Array) => { const v: Array<[number, number, number]> = []; for (let i = 0; i < mesh.length; i += 9) v.push([mesh[i], mesh[i + 1], mesh[i + 2]]); return v }
  const railsOverPlatform = (mesh: Float32Array) => vertices(mesh).filter(([x, , z]) => x < -3.2 && z > 3.5 + 0.3)

  it('without a doorway the top platform has rails on both sides', () => {
    const ys = railsOverPlatform(floorStairMesh([outside()], 0, (p) => p)).map(([, y]) => y)
    expect(Math.min(...ys)).toBeLessThan(-0.3)
    expect(Math.max(...ys)).toBeGreaterThan(0.3)
  })

  it('with its doorway to the south, the platform is open on the south side and railed on the north', () => {
    const ys = railsOverPlatform(floorStairMesh([outside({ x: -4, y: -0.9 })], 0, (p) => p)).map(([, y]) => y)
    expect(ys.length).toBeGreaterThan(0)
    expect(Math.min(...ys)).toBeGreaterThan(0.3)
  })

  it('an outside stair gets a ground landing beyond its foot', () => {
    const at = vertices(floorStairMesh([outside({ x: -4, y: -0.9 })], 0, (p) => p))
    expect(Math.max(...at.map(([x]) => x))).toBeGreaterThan(3 + 1)
    const without = vertices(floorStairMesh([outside()], 0, (p) => p))
    expect(Math.max(...without.map(([x]) => x))).toBeLessThan(3 + 0.5)
  })

  it('the top platform of an outside stair is a closed solid block down to the ground (not hollow)', () => {
    const mesh = floorStairMesh([outside({ x: -4, y: -0.9 })], 0, (p) => p)
    // its far end at x = -5: a face (facing -x) reaching from the ground up to the platform (3.5 m)
    const end: Array<[number, number, number]> = []
    for (let i = 0; i < mesh.length; i += 9) if (Math.abs(mesh[i] + 5) < 0.02 && mesh[i + 3] < -0.9) end.push([mesh[i], mesh[i + 1], mesh[i + 2]])
    expect(Math.min(...end.map(([, , z]) => z))).toBeLessThanOrEqual(0.001)
    expect(Math.max(...end.map(([, , z]) => z))).toBeGreaterThanOrEqual(3.5 - 0.001)
  })
})


describe('railings chosen per stair (owner 2026-11-17)', () => {
  const stair = (props: Record<string, unknown>): StairAssetInput => ({
    id: 'r', position: { x: 0, y: 0 }, rotation: 90, height: 3.5,
    drawing: { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.5, stepDepth: 0.3, direction: 'south', preset: 'straight', ...props } } as never,
  })
  // climbing west (towards -x): "left" as you walk up is south (y < 0), "right" is north (y > 0);
  // rails sit 6 cm inside the 0.75 m edge (y = ±0.69), unlike the solid sides at ±0.75
  const railYs = (mesh: Float32Array) => { const ys: number[] = []; for (let i = 0; i < mesh.length; i += 9) if (mesh[i] > -2.5 && mesh[i] < 2.5 && mesh[i + 2] > 2.5 && Math.abs(Math.abs(mesh[i + 1]) - 0.69) < 0.05) ys.push(mesh[i + 1]); return ys }

  it('Left only: rails on the left side as you walk up', () => {
    const ys = railYs(floorStairMesh([stair({ railings: 'left' })], 0, (p) => p))
    expect(ys.length).toBeGreaterThan(0)
    expect(Math.max(...ys)).toBeLessThan(0)
  })

  it('Right only: rails on the right side', () => {
    const ys = railYs(floorStairMesh([stair({ railings: 'right' })], 0, (p) => p))
    expect(Math.min(...ys)).toBeGreaterThan(0)
  })

  it('None: no rails; Both: both sides', () => {
    expect(railYs(floorStairMesh([stair({ railings: 'none' })], 0, (p) => p))).toHaveLength(0)
    const ys = railYs(floorStairMesh([stair({ railings: 'both' })], 0, (p) => p))
    expect(Math.min(...ys)).toBeLessThan(0)
    expect(Math.max(...ys)).toBeGreaterThan(0)
  })

  it('a chosen side wins over the doorway rule (the owner decides)', () => {
    const ys = railYs(floorStairMesh([{ ...stair({ railings: 'left' }), doorwayAt: { x: -4, y: -0.9 } }], 0, (p) => p))
    expect(Math.max(...ys)).toBeLessThan(0)
  })
})

describe('terrain stair controls on floor stairs (owner 2026-11-17)', () => {
  const straight = (props: Record<string, unknown>): StairAssetInput => ({
    id: 't', position: { x: 0, y: 0 }, rotation: 90, height: 3.5,
    drawing: { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.5, stepDepth: 0.3, direction: 'south', preset: 'straight', ...props } } as never,
  })
  const pts = (mesh: Float32Array) => { const v: Array<[number, number, number]> = []; for (let i = 0; i < mesh.length; i += 9) v.push([mesh[i], mesh[i + 1], mesh[i + 2]]); return v }

  it('Underneath: solid reaches the ground under the top; open leaves it hollow', () => {
    const lowUnderTop = (mesh: Float32Array) => Math.min(...pts(mesh).filter(([x]) => x < -2.5).map(([, , z]) => z))
    expect(lowUnderTop(floorStairMesh([straight({})], 0, (p) => p))).toBeLessThan(0)
    expect(lowUnderTop(floorStairMesh([straight({ underneath: 'open' })], 0, (p) => p))).toBeGreaterThan(2)
  })

  it('Landings: a level resting platform partway up, as long as set', () => {
    const level = (mesh: Float32Array) => {
      const mid = pts(mesh).filter(([, , z]) => z > 1.3 && z < 2.2)
      const byZ = new Map<number, number[]>()
      for (const [x, , z] of mid) { const k = Math.round(z * 1000); byZ.set(k, [...(byZ.get(k) ?? []), x]) }
      return Math.max(0, ...[...byZ.values()].map((xs) => Math.max(...xs) - Math.min(...xs)))
    }
    expect(level(floorStairMesh([straight({ landings: [0.5], landingLengthM: 1.5 })], 0, (p) => p))).toBeGreaterThanOrEqual(1.4)
    expect(level(floorStairMesh([straight({})], 0, (p) => p))).toBeLessThan(1)
  })
})

describe('every solid stair is closed, inside or outside (owner 2026-11-17)', () => {
  // U-Shape climbing east from x = -2.1; its half-landing is at the far end (x 0.9..2.1) at 1.75 m.
  const faces = (mesh: Float32Array, nx: number, ny: number) => {
    const v: Array<[number, number, number]> = []
    for (let i = 0; i < mesh.length; i += 9) if (mesh[i + 3] * nx + mesh[i + 4] * ny > 0.9) v.push([mesh[i], mesh[i + 1], mesh[i + 2]])
    return v
  }
  it('an inside U-Shape stair: its half-landing stands on a block (far end face from the floor up to 1.75 m)', () => {
    const end = faces(floorStairMesh([u('wall')], 0, (p) => p), 1, 0).filter(([x]) => Math.abs(x - 2.1) < 0.02)
    expect(Math.min(...end.map(([, , z]) => z))).toBeLessThanOrEqual(0.001)
    expect(Math.max(...end.map(([, , z]) => z))).toBeGreaterThanOrEqual(1.75 - 0.001)
  })

  it('its first flight is closed at its low end (a face at the start, facing back)', () => {
    const start = faces(floorStairMesh([u('wall')], 0, (p) => p), -1, 0).filter(([x]) => Math.abs(x + 2.1) < 0.02)
    expect(start.length).toBeGreaterThan(0)
  })

  it('Underneath = Open stays open (no blocks)', () => {
    const open = floorStairMesh([{ ...u('wall'), drawing: { ...u('wall').drawing!, properties: { ...u('wall').drawing!.properties, underneath: 'open' } as never } }], 0, (p) => p)
    const end = faces(open, 1, 0).filter(([x, , z]) => Math.abs(x - 2.1) < 0.02 && z < 0.5)
    expect(end).toHaveLength(0)
  })
})

describe('landing heights (owner 2026-11-17: "platform adjustment")', () => {
  const straight = (props: Record<string, unknown>): StairAssetInput => ({
    id: 'h', position: { x: 0, y: 0 }, rotation: 90, height: 3.5,
    drawing: { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.5, stepDepth: 0.3, direction: 'south', preset: 'straight', ...props } } as never,
  })
  const levelAt = (mesh: Float32Array, z: number) => {
    const xs: number[] = []
    for (let i = 0; i < mesh.length; i += 9) if (Math.abs(mesh[i + 2] - z) < 0.01 && mesh[i + 5] === 0 && mesh[i + 3] === 0 && mesh[i + 4] === 0) xs.push(mesh[i])
    return xs.length ? Math.max(...xs) - Math.min(...xs) : 0
  }
  it('a landing set to 1.0 m above the floor is level at 1.0 m (standing on a floor at 3.5 m: 4.5 m)', () => {
    const mesh = floorStairMesh([straight({ landings: [0.5], landingLengthM: 1.5, landingHeightsM: [1.0] })], 3.5, (p) => p)
    let found = false
    for (let i = 0; i < mesh.length; i += 9) if (Math.abs(mesh[i + 2] - 4.5) < 0.01) found = true
    expect(found).toBe(true)
    expect(levelAt(mesh, 4.5)).toBeGreaterThanOrEqual(0)
  })
})
