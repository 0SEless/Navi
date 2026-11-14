import { describe, expect, it } from 'vitest'
import type { Opening, Wall } from '../../types/entities'
import { buildWindowAssetVolumes } from '../window-assets'

const wall: Wall = { id: 'wall', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, height: 3, thickness: 0.2 }
const win = (extra: Partial<Opening> & Record<string, unknown> = {}) => ({ id: 'w', type: 'window', wallId: 'wall', offset: 2, width: 1.2, height: 1.2, sillHeight: 0.9, ...extra }) as Opening
const build = (extra: Record<string, unknown>) => buildWindowAssetVolumes([wall], [win(extra)])
type F = { id?: string | number; properties: Record<string, any>; geometry: { coordinates: number[][][] } }
const named = (fs: F[], part: string) => fs.filter(f => String(f.id).includes(part))
const all = (v: ReturnType<typeof build>) => [...v.frames.features, ...v.glass.features] as F[]

describe('window volumes: backward compatibility', () => {
  it('existing fixed/two-pane/open volumes unchanged (snapshot)', () => {
    const cases = { open: build({}), openExplicit: build({ windowAppearance: 'open' }), fixed: build({ windowAppearance: 'fixed' }), twoPane: build({ windowAppearance: 'two-pane' }) }
    expect(JSON.stringify(cases)).toMatchSnapshot()
  })
})

describe('window volumes: new types (Task 14)', () => {
  it('jalousie: 8 tilted slats (default) within the aperture, tilt 0 closed / 60° open', () => {
    const closed = named(build({ windowAppearance: 'jalousie' }).glass.features as F[], 'slat')
    expect(closed).toHaveLength(8)
    for (const s of closed) {
      expect(s.properties.base).toBeGreaterThanOrEqual(0.9); expect(s.properties.height).toBeLessThanOrEqual(2.1)
      for (const [x, y] of s.geometry.coordinates[0]) { expect(x).toBeGreaterThanOrEqual(2); expect(x).toBeLessThanOrEqual(3.2); expect(Math.abs(y)).toBeLessThanOrEqual(0.1) }
    }
    const open = named(build({ windowAppearance: 'jalousie', windowPose: 'open' }).glass.features as F[], 'slat')
    const span = (s: F) => s.properties.height - s.properties.base
    const depth = (s: F) => Math.max(...s.geometry.coordinates[0].map(p => p[1])) - Math.min(...s.geometry.coordinates[0].map(p => p[1]))
    expect(span(open[0])).toBeCloseTo(span(closed[0]) * Math.cos(Math.PI / 3), 6)
    expect(depth(open[0])).toBeGreaterThan(depth(closed[0]))
  })

  it('sliding: two framed sashes on separate tracks, overlapping at the middle', () => {
    const v = build({ windowAppearance: 'sliding' })
    const panes = named(v.glass.features as F[], 'slide-')
    expect(panes).toHaveLength(2)
    expect(named(v.frames.features as F[], 'sash').length).toBe(8)
    const xs = (f: F) => f.geometry.coordinates[0].map(p => p[0]), ys = (f: F) => f.geometry.coordinates[0].map(p => p[1])
    expect(Math.max(...xs(panes[0]))).toBeGreaterThan(Math.min(...xs(panes[1])) - 0.05)
    expect(Math.max(...ys(panes[0]))).toBeLessThan(Math.min(...ys(panes[1])))
  })

  it('casement: two framed leaves with a mullion; open swings each leaf about its outer jamb', () => {
    const closed = build({ windowAppearance: 'casement' })
    expect(named(closed.frames.features as F[], 'mullion')).toHaveLength(1)
    expect(named(closed.glass.features as F[], 'leaf-')).toHaveLength(2)
    const open = build({ windowAppearance: 'casement', windowPose: 'open' })
    const ys = (f: F) => f.geometry.coordinates[0].map(p => p[1]), xs = (f: F) => f.geometry.coordinates[0].map(p => p[0])
    const left = named(open.glass.features as F[], 'leaf-left')[0], right = named(open.glass.features as F[], 'leaf-right')[0]
    expect(Math.max(...ys(left))).toBeGreaterThan(0.35); expect(Math.max(...ys(right))).toBeGreaterThan(0.35)
    expect(Math.max(...xs(left))).toBeLessThan(2.2); expect(Math.min(...xs(right))).toBeGreaterThan(3.0)
  })

  it('awning: two stacked framed sashes with a rail; open tilts both outward from their tops', () => {
    const closed = build({ windowAppearance: 'awning' })
    expect(named(closed.frames.features as F[], 'rail')).toHaveLength(1)
    expect(named(closed.glass.features as F[], '-pane')).toHaveLength(2)
    const open = build({ windowAppearance: 'awning', windowPose: 'open' })
    const slices = named(open.glass.features as F[], 'pane-')
    expect(slices.length).toBe(8)
    const ys = (f: F) => f.geometry.coordinates[0].map(p => p[1])
    expect(Math.max(...slices.flatMap(ys))).toBeGreaterThan(0.1)
    expect(Math.max(...slices.map(f => f.properties.height))).toBeLessThanOrEqual(2.1 - 0.05 + 1e-9)
  })

  it('every window type draws a different set of solids from a fixed window', () => {
    const shape = (extra: Record<string, unknown>) => all(build(extra)).map(f => String(f.id).split(':').slice(1).join(':')).sort().join(',')
    const fixed = shape({ windowAppearance: 'fixed' })
    const types = ['two-pane', 'sliding', 'casement', 'awning', 'jalousie', 'transom', 'vent-block']
    const shapes = types.map(windowAppearance => shape({ windowAppearance }))
    for (const s of shapes) expect(s).not.toBe(fixed)
    expect(new Set(shapes).size).toBe(types.length)
  })

  it('transom at its catalog sill 2.1 m sits between 2.1 and 2.5 m', () => {
    const v = build({ assetPreset: 'window.transom', sillHeight: 2.1, height: 0.4 })
    expect(v.glass.features).toHaveLength(1)
    for (const f of all(v)) { expect(f.properties.base).toBeGreaterThanOrEqual(2.1); expect(f.properties.height).toBeLessThanOrEqual(2.5 + 1e-9) }
  })

  it('vent-block: grid of solids, no glass', () => {
    const v = build({ windowAppearance: 'vent-block' })
    expect(v.glass.features).toHaveLength(0)
    expect(named(v.frames.features as F[], 'grid').length).toBeGreaterThan(4)
  })

  it('<= 40 solids for every type, even on a wide window', () => {
    for (const windowAppearance of ['jalousie', 'sliding', 'casement', 'awning', 'transom', 'vent-block', 'fixed', 'two-pane'])
      for (const windowPose of ['closed', 'open']) expect(all(buildWindowAssetVolumes([wall], [win({ windowAppearance, windowPose, width: 6, height: 2 } as never)])).length).toBeLessThanOrEqual(40)
  })

  it('chosen material and glass colour the features; unstyled windows carry no colour', () => {
    for (const f of all(build({ windowAppearance: 'fixed' }))) expect(f.properties).not.toHaveProperty('color')
    const v = build({ assetPreset: 'window.fixed', material: 'wood', glass: 'tinted' })
    expect(v.glass.features.length).toBeGreaterThan(0)
    for (const f of v.frames.features as F[]) expect(f.properties.color).toBe('#8B5E3C')
    for (const f of v.glass.features as F[]) expect(f.properties).toMatchObject({ color: '#64748B', glassOpacity: 0.45 })
  })
})
