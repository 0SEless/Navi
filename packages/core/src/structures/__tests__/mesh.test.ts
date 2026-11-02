import { describe, expect, it } from 'vitest'
import { buildStructureMesh, type MeshInput } from '../mesh'
import { structurePath } from '../path'
import { stairShape } from '../stair-shape'
import { BUILT_IN_MATERIALS, BUILT_IN_PRESETS } from '../materials'

const look = { tread: 't', side: 's', under: 'u', railing: 'r', railingStyle: 'posts-rails' as const }
const materials = {
  t: { id: 't', name: 'tread', color: '#ff0000' },
  s: { id: 's', name: 'side', color: '#00ff00' },
  u: { id: 'u', name: 'under', color: '#0000ff' },
  r: { id: 'r', name: 'rail', color: '#ffff00' },
}

function input(overrides: Partial<MeshInput> = {}): MeshInput {
  return {
    path: structurePath({ x: 0, y: 0 }, { x: 12, y: 0 }),
    startH: 20, endH: 16.5, form: 'stairs', width: 2, underneath: 'open', railings: 'both',
    groundAt: () => 10, look, materials, ...overrides,
  }
}

/** Vertices of one colour: [x, y, z, nx, ny, nz]. */
function verticesOf(mesh: Float32Array, color: [number, number, number]) {
  const out: number[][] = []
  for (let i = 0; i < mesh.length; i += 9) {
    if (Math.abs(mesh[i + 6] - color[0]) < 1e-3 && Math.abs(mesh[i + 7] - color[1]) < 1e-3 && Math.abs(mesh[i + 8] - color[2]) < 1e-3) out.push([...mesh.slice(i, i + 6)])
  }
  return out
}

/** The slope line of the test stair (rise -3.5 over a 6 m flight centred in 12 m: 3..9). */
const line = (s: number) => (s <= 3 ? 20 : s >= 9 ? 16.5 : 20 - (3.5 * (s - 3)) / 6)

describe('buildStructureMesh', () => {
  it('vertex count is a multiple of 3 and all values are finite', () => {
    const mesh = buildStructureMesh(input())
    expect(mesh.length % 27).toBe(0) // 3 vertices × 9 floats per triangle
    expect(mesh.every((v) => Number.isFinite(v))).toBe(true)
    expect(stairShape(-3.5, 12).flightStartM).toBeCloseTo(3, 6)
  })

  it('open stair underside is a straight line', () => {
    const under = verticesOf(buildStructureMesh(input()), [0, 0, 1])
    expect(under.length).toBeGreaterThan(0)
    const riser = 3.5 / 20
    for (const [x, , z] of under) expect(Math.abs(z - (line(x) - riser - 0.2))).toBeLessThan(1e-3)
  })

  it('rails follow the slope line', () => {
    const rails = verticesOf(buildStructureMesh(input()), [1, 1, 0])
    expect(rails.length).toBeGreaterThan(0)
    for (const [x, , z] of rails) expect(z - line(x)).toBeLessThanOrEqual(0.95 + 0.035 + 1e-3)
    const topOfRail = rails.filter(([x, , z]) => Math.abs(z - (line(x) + 0.985)) < 2e-3)
    expect(new Set(topOfRail.map(([x]) => Math.round(x))).size).toBeGreaterThan(8) // the top rail runs the whole length
  })

  it('solid stair has no underside quads and its sides reach into the ground', () => {
    const mesh = buildStructureMesh(input({ underneath: 'solid' }))
    expect(verticesOf(mesh, [0, 0, 1])).toHaveLength(0)
    expect(verticesOf(mesh, [0, 1, 0]).some(([, , z]) => Math.abs(z - 9.6) < 1e-6)).toBe(true)
  })

  it('no railings → no rail vertices; bent paths stay finite', () => {
    expect(verticesOf(buildStructureMesh(input({ railings: 'none' })), [1, 1, 0])).toHaveLength(0)
    const bent = buildStructureMesh(input({ path: structurePath({ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 6, y: 8 }) }))
    expect(bent.every((v) => Number.isFinite(v))).toBe(true)
  })

  it('a zero-length stair gives an empty mesh', () => {
    expect(buildStructureMesh(input({ path: structurePath({ x: 1, y: 1 }, { x: 1, y: 1 }) })).length).toBe(0)
  })
})

describe('built-in materials and presets', () => {
  it('every preset uses built-in materials and a valid form', () => {
    expect(BUILT_IN_PRESETS.map((p) => p.id)).toEqual(['plain-stair', 'hillside-stair', 'open-steel-stair', 'plain-ramp'])
    for (const preset of BUILT_IN_PRESETS) {
      for (const id of [preset.look.tread, preset.look.side, preset.look.under, preset.look.railing]) expect(BUILT_IN_MATERIALS[id]).toBeDefined()
    }
    expect(BUILT_IN_PRESETS.find((p) => p.id === 'hillside-stair')!.shape).toEqual({ width: 4.5, underneath: 'solid', railings: 'both' })
  })
})

describe('ramps', () => {
  const ramp = (overrides: Partial<MeshInput> = {}) => buildStructureMesh(input({ form: 'ramp', startH: 10, endH: 11, landings: [0.5], ...overrides }))

  it('ramp top surface is level across a landing', () => {
    const tread = verticesOf(ramp(), [1, 0, 0])
    const onLanding = tread.filter(([x]) => x >= 5.25 - 1e-6 && x <= 6.75 + 1e-6)
    expect(onLanding.length).toBeGreaterThan(0)
    for (const [, , z] of onLanding) expect(z).toBeCloseTo(10.5, 5)
    // Linear between: halfway up the first run.
    const quarter = tread.filter(([x]) => Math.abs(x - 2.625) < 0.13)
    for (const [x, , z] of quarter) expect(z).toBeCloseTo(10 + (0.5 * x) / 5.25, 4)
  })

  it('a ramp has no risers and its open underside is 0.20 m under the top', () => {
    const mesh = ramp()
    expect(verticesOf(mesh, [0.85, 0, 0])).toHaveLength(0) // risers are 0.85 × the tread colour
    expect(verticesOf(buildStructureMesh(input()), [0.85, 0, 0]).length).toBeGreaterThan(0)
    const under = verticesOf(mesh, [0, 0, 1])
    expect(under.length).toBeGreaterThan(0)
    for (const [x, , z] of under) {
      const top = x <= 5.25 ? 10 + (0.5 * x) / 5.25 : x >= 6.75 ? 10.5 + (0.5 * (x - 6.75)) / 5.25 : 10.5
      expect(z).toBeCloseTo(top - 0.2, 4)
    }
  })
})
