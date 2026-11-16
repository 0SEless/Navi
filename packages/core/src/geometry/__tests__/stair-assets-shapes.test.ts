import { describe, expect, it } from 'vitest'
import { buildStairAssetVolumes, type StairAssetInput } from '../stair-assets'

type Props = NonNullable<StairAssetInput['drawing']>['properties']
const u = (props: Partial<Props> = {}): StairAssetInput => ({
  id: 'u', position: { x: 0, y: 0 }, rotation: 0, height: 3.5,
  drawing: { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'ushape', ...props } },
})
const parts = (input: StairAssetInput, type: string) =>
  buildStairAssetVolumes([input]).collection.features.filter(f => f.properties!.partType === type)
const points = (features: GeoJSON.Feature<GeoJSON.Polygon>[]) => features.flatMap(f => f.geometry.coordinates[0])
const bbox = (features: GeoJSON.Feature<GeoJSON.Polygon>[]) => {
  const ps = points(features)
  const xs = ps.map(p => p[0]), ys = ps.map(p => p[1])
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}
const centre = (f: GeoJSON.Feature<GeoJSON.Polygon>) => {
  const ring = f.geometry.coordinates[0].slice(0, -1)
  return { x: ring.reduce((s, p) => s + p[0], 0) / ring.length, y: ring.reduce((s, p) => s + p[1], 0) / ring.length }
}

describe('U-Shape stair', () => {
  it('ushape footprint: two flights, 0.2 m gap, landing as deep as a flight is wide', () => {
    const box = bbox([...parts(u(), 'step'), ...parts(u(), 'landing')])
    // east: the flight runs along x (depth), the two flights side by side along y (width)
    expect(box.w).toBeCloseTo(10 * 0.3 + 1.2, 6)
    expect(box.h).toBeCloseTo(2 * 1.2 + 0.2, 6)
  })

  it('ushape heights: steps rise across both flights, landing at half height', () => {
    const steps = parts(u(), 'step')
    expect(steps).toHaveLength(20)
    const heights = steps.map(f => f.properties!.height as number)
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeGreaterThan(heights[i - 1])
    expect(heights[0]).toBeCloseTo(0.175, 6)
    expect(heights[19]).toBeCloseTo(3.5, 6)
    const side = (f: GeoJSON.Feature<GeoJSON.Polygon>) => Math.sign(centre(f).y)
    expect(new Set(steps.slice(0, 10).map(side)).size).toBe(1)
    expect(new Set(steps.slice(10).map(side)).size).toBe(1)
    expect(side(steps[0])).toBe(-side(steps[10]))
    const landing = parts(u(), 'landing')
    expect(landing).toHaveLength(1)
    expect(landing[0].properties!.height).toBeCloseTo(1.75, 6)
  })

  it('turn mirrors: left puts the second flight on the other side', () => {
    const right = centre(parts(u(), 'step')[10]).y
    const left = centre(parts(u({ turn: 'left' }), 'step')[10]).y
    expect(left).toBeCloseTo(-right, 6)
    expect(centre(parts(u({ turn: 'right' }), 'step')[10]).y).toBeCloseTo(right, 6)
  })

  it('top landing: level at full rise, default as long as a flight is wide, or as set', () => {
    const def = parts(u(), 'top-landing')
    expect(def).toHaveLength(1)
    expect(def[0].properties!.height).toBeCloseTo(3.5, 6)
    expect(bbox(def).w).toBeCloseTo(1.2, 6)
    expect(bbox(parts(u({ topLandingM: 2 }), 'top-landing')).w).toBeCloseTo(2, 6)
  })

  it('sides wall: parapets about 1.0 m above their treads on the outer sides and in the middle', () => {
    const steps = parts(u({ sides: 'wall' }), 'step')
    const parapets = parts(u({ sides: 'wall' }), 'parapet')
    expect(parapets.length).toBeGreaterThan(0)
    const ys = parapets.map(f => centre(f).y)
    expect(Math.max(...ys)).toBeGreaterThan(1.2)
    expect(Math.min(...ys)).toBeLessThan(-1.2)
    expect(ys.some(y => Math.abs(y) < 0.2)).toBe(true)
    const tops = new Set(parapets.map(f => Math.round(((f.properties!.height as number) - 1) * 1000)))
    for (const step of steps) expect(tops.has(Math.round((step.properties!.height as number) * 1000))).toBe(true)
  })

  it('sides railing: thin rails 0.9 to 0.95 m above each tread', () => {
    const rails = parts(u({ sides: 'railing' }), 'rail')
    expect(rails.length).toBeGreaterThan(0)
    const steps = parts(u({ sides: 'railing' }), 'step').map(f => f.properties!.height as number)
    for (const rail of rails) {
      const base = rail.properties!.base as number, height = rail.properties!.height as number
      expect(height - base).toBeCloseTo(0.05, 6)
      expect(steps.some(h => Math.abs(base - (h + 0.9)) < 1e-6) || Math.abs(base - (1.75 + 0.9)) < 1e-6 || Math.abs(base - (3.5 + 0.9)) < 1e-6).toBe(true)
    }
    expect(parts(u({ sides: 'railing' }), 'parapet')).toHaveLength(0)
  })

  it('sides open by default: no parapets or rails', () => {
    expect(parts(u(), 'parapet')).toHaveLength(0)
    expect(parts(u(), 'rail')).toHaveLength(0)
  })

  it('lshape and spiral are still unsupported', () => {
    for (const preset of ['lshape', 'spiral']) {
      const result = buildStairAssetVolumes([u({ preset })])
      expect(result.collection.features).toHaveLength(0)
      expect(result.diagnostics.map(d => d.code)).toEqual(['unsupported-preset'])
    }
  })
})

describe('straight stair with the new settings', () => {
  const straight = (props: Partial<Props> = {}): StairAssetInput => ({
    id: 's', position: { x: 10, y: 20 }, rotation: 0, height: 3,
    drawing: { definitionId: 'stair', properties: { stepCount: 4, stepWidth: 2, stepDepth: 0.5, direction: 'south', preset: 'straight', ...props } },
  })

  it('sides absent = output unchanged (no top landing, no sides)', () => {
    const result = buildStairAssetVolumes([straight()])
    expect(result.collection.features.map(f => f.properties!.partType)).toEqual(['step', 'step', 'step', 'step'])
  })

  it('wall sides on a straight stair: parapets on both long sides', () => {
    const parapets = parts(straight({ sides: 'wall' }), 'parapet')
    expect(parapets).toHaveLength(8)
  })

  it('top landing on a straight stair only when its length is set', () => {
    const top = parts(straight({ topLandingM: 1.5 }), 'top-landing')
    expect(top).toHaveLength(1)
    expect(top[0].properties!.height).toBeCloseTo(3, 6)
  })
})
