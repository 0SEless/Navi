import { describe, expect, it } from 'vitest'
import { buildOpeningPlanSymbols } from '../opening-symbols'
import type { Opening, Wall } from '../../types/entities'

const wall = { id: 'w', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, height: 3, thickness: 0.2 } as Wall
const door = (extra: Record<string, unknown> = {}) => ({ id: 'd', width: 1, doorType: 'standard', wallAttachment: { wallId: 'w', offset: 3, openingHeight: 2.1 }, ...extra })
type F = { properties: Record<string, unknown>; geometry: { coordinates: any } }
const lines = (r: ReturnType<typeof buildOpeningPlanSymbols>, kind: string) => (r.lines.features as F[]).filter(f => f.properties.kind === kind)
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1])

describe('buildOpeningPlanSymbols', () => {
  it('hinged single: one leaf from the hinge with length = width, and one 25-point arc of radius = width on the swing side', () => {
    const r = buildOpeningPlanSymbols([wall], [], [door()] as never)
    const [leaf] = lines(r, 'leaf'), [arc] = lines(r, 'arc')
    expect(lines(r, 'leaf')).toHaveLength(1)
    expect(lines(r, 'arc')).toHaveLength(1)
    const hinge = [2.5, 0]
    expect(leaf.geometry.coordinates[0]).toEqual(hinge)
    expect(dist(leaf.geometry.coordinates[1], hinge)).toBeCloseTo(1, 6)
    expect(arc.geometry.coordinates).toHaveLength(25)
    for (const p of arc.geometry.coordinates) expect(dist(p, hinge)).toBeCloseTo(1, 6)
    expect(Math.max(...arc.geometry.coordinates.map((p: number[]) => p[1]))).toBeGreaterThan(0.9)
  })

  it('swingSide right puts the arc on the other side of the wall', () => {
    const [arc] = lines(buildOpeningPlanSymbols([wall], [], [door({ swingSide: 'right' })] as never), 'arc')
    expect(Math.min(...arc.geometry.coordinates.map((p: number[]) => p[1]))).toBeLessThan(-0.9)
    expect(Math.max(...arc.geometry.coordinates.map((p: number[]) => p[1]))).toBeLessThan(1e-9)
  })

  it('hingeSide end moves the hinge to the other jamb', () => {
    const [leaf] = lines(buildOpeningPlanSymbols([wall], [], [door({ hingeSide: 'end' })] as never), 'leaf')
    expect(leaf.geometry.coordinates[0]).toEqual([3.5, 0])
  })

  it('double: two leaves and two arcs meeting at the centre', () => {
    const r = buildOpeningPlanSymbols([wall], [], [door({ doorType: 'double', hingeSide: 'end' })] as never)
    expect(lines(r, 'leaf')).toHaveLength(2)
    const arcs = lines(r, 'arc')
    expect(arcs).toHaveLength(2)
    for (const a of arcs) expect(a.geometry.coordinates.some((p: number[]) => dist(p, [3, 0]) < 1e-9)).toBe(true)
  })

  it('sliding: two parallel panel lines inside the wall thickness, plus one arrow; no arc', () => {
    const r = buildOpeningPlanSymbols([wall], [], [door({ doorType: 'sliding' })] as never)
    const panels = lines(r, 'panel')
    expect(panels).toHaveLength(2)
    for (const p of panels) for (const q of p.geometry.coordinates) expect(Math.abs(q[1])).toBeLessThanOrEqual(0.1)
    expect(lines(r, 'arrow')).toHaveLength(1)
    expect(lines(r, 'arc')).toHaveLength(0)
  })

  it('archway: two jamb ticks only', () => {
    const r = buildOpeningPlanSymbols([wall], [], [door({ doorType: 'opening' })] as never)
    expect((r.lines.features as F[]).map(f => f.properties.kind)).toEqual(['jamb', 'jamb'])
  })

  it('fire: hinged symbols plus one fire marker at the opening centre', () => {
    const r = buildOpeningPlanSymbols([wall], [], [door({ doorType: 'fire' })] as never)
    expect(lines(r, 'arc')).toHaveLength(1)
    const markers = (r.markers.features as F[]).filter(f => f.properties.kind === 'fire')
    expect(markers).toHaveLength(1)
    expect(markers[0].geometry.coordinates).toEqual([3, 0])
  })

  it('windows fixed/two-pane/open draw face, glass, face lines; two-pane splits the glass line', () => {
    for (const windowAppearance of ['fixed', 'open', undefined]) {
      const win = { id: 'win', type: 'window', wallId: 'w', offset: 5, width: 2, ...(windowAppearance ? { windowAppearance } : {}) } as Opening
      const kinds = (buildOpeningPlanSymbols([wall], [win], []).lines.features as F[]).map(f => f.properties.kind)
      expect(kinds).toEqual(['window-face', 'window-glass', 'window-face'])
    }
    const two = { id: 'win', type: 'window', wallId: 'w', offset: 5, width: 2, windowAppearance: 'two-pane' } as Opening
    expect((buildOpeningPlanSymbols([wall], [two], []).lines.features as F[]).filter(f => f.properties.kind === 'window-glass')).toHaveLength(2)
  })

  it('invalid door (no wall, no rotation) yields no features and does not throw', () => {
    const r = buildOpeningPlanSymbols([], [], [{ id: 'x', width: 1, doorType: 'standard', position: { x: 0, y: 0 } }] as never)
    expect(r.lines.features).toHaveLength(0)
    expect(r.markers.features).toHaveLength(0)
  })
})

describe('folding and roll-up symbols (Task 10)', () => {
  it('folding: one zigzag polyline across the opening with 2 × panels + 1 points', () => {
    const r = buildOpeningPlanSymbols([wall], [], [door({ doorOperation: 'folding' })] as never)
    const zig = lines(r, 'fold')
    expect(zig).toHaveLength(1)
    const c = zig[0].geometry.coordinates as number[][]
    expect(c).toHaveLength(9)
    expect(c[0]).toEqual([2.5, 0])
    expect(c[8][0]).toBeCloseTo(3.5, 9)
    expect(Math.max(...c.map(p => Math.abs(p[1])))).toBeGreaterThan(0.05)
    expect(lines(r, 'arc')).toHaveLength(0)
  })

  it('rolling: dashed shutter line plus two head-box ticks', () => {
    const r = buildOpeningPlanSymbols([wall], [], [door({ assetPreset: 'door.rollup' })] as never)
    expect(lines(r, 'shutter')).toHaveLength(1)
    expect(lines(r, 'head-box')).toHaveLength(2)
    expect(lines(r, 'leaf')).toHaveLength(0)
  })
})

describe('window symbols (Task 15)', () => {
  const win = (extra: Record<string, unknown>) => ({ id: 'win', type: 'window', wallId: 'w', offset: 5, width: 1.2, ...extra }) as unknown as Opening
  it('jalousie adds hatch strokes', () => {
    const r = buildOpeningPlanSymbols([wall], [win({ windowAppearance: 'jalousie' })], [])
    expect(lines(r, 'window-hatch').length).toBeGreaterThanOrEqual(4)
    expect(lines(r, 'window-face')).toHaveLength(2)
  })
  it('sliding offsets the glass line in two halves', () => {
    const glass = lines(buildOpeningPlanSymbols([wall], [win({ assetPreset: 'window.sliding' })], []), 'window-glass')
    expect(glass).toHaveLength(2)
    const y = (f: F) => f.geometry.coordinates[0][1]
    expect(y(glass[0])).toBeLessThan(0); expect(y(glass[1])).toBeGreaterThan(0)
    expect(glass[0].geometry.coordinates[1][0]).toBeGreaterThan(glass[1].geometry.coordinates[0][0])
  })
  it('casement/awning add a dashed swing indicator', () => {
    const casement = buildOpeningPlanSymbols([wall], [win({ windowAppearance: 'casement' })], [])
    expect(lines(casement, 'window-swing')).toHaveLength(2)
    expect(lines(casement, 'window-mullion')).toHaveLength(1)
    expect(lines(buildOpeningPlanSymbols([wall], [win({ windowAppearance: 'awning' })], []), 'window-swing')).toHaveLength(1)
    expect(lines(buildOpeningPlanSymbols([wall], [win({ windowAppearance: 'fixed' })], []), 'window-swing')).toHaveLength(0)
  })
})
