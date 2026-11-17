import { describe, expect, it } from 'vitest'
import { buildStairAssetVolumes, type StairAssetInput } from '../stair-assets'

const stair: StairAssetInput = {
  id: 'stair', position: { x: 10, y: 20 }, rotation: 0, height: 3,
  drawing: { definitionId: 'stair', properties: { stepCount: 4, stepWidth: 2, stepDepth: 0.5, direction: 'south', preset: 'straight' } },
}
describe('stair asset volumes', () => {
  it.each([false, true])('follows ordered freeform edges rather than the longest dimension (reversed=%s)', reversed => {
    const points = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 2 }, { x: 0, y: 2 }]
    if (reversed) points.reverse()
    const result = buildStairAssetVolumes([{ ...stair, position: { x: 0, y: 0 }, drawing: undefined, polygon: { points } }])
    expect(result.collection.features).toHaveLength(17)
    const center = (i: number) => result.collection.features[i].geometry.coordinates[0].slice(0, 4).reduce((sum, point) => sum + point[1] / 4, 0)
    expect(center(16) - center(0)).toBeCloseTo((reversed ? -1 : 1) * 2 * 16 / 17)
    for (const feature of result.collection.features) {
      const xs = feature.geometry.coordinates[0].map(point => point[0])
      expect(Math.min(...xs)).toBe(0)
      expect(Math.max(...xs)).toBe(8)
    }
  })
  it.each([true, false])('accepts open canonical rectangles and landings without mutation (authored=%s)', authored => {
    const polygon = { points: [{ x: 9, y: 17 }, { x: 11, y: 17 }, { x: 11, y: 23 }, { x: 9, y: 23 }] }
    const input: StairAssetInput = { ...stair, drawing: authored ? stair.drawing : undefined, polygon, landing: { position: { x: 10, y: 16 }, polygon: { points: [{ x: 9, y: 15 }, { x: 11, y: 15 }, { x: 11, y: 17 }, { x: 9, y: 17 }] } } }
    const before = JSON.stringify(input)
    const result = buildStairAssetVolumes([input])
    expect(result.collection.features.filter(f => f.properties!.partType === 'step')).toHaveLength(authored ? 4 : 17)
    const landings = result.collection.features.filter(f => f.properties!.partType === 'landing')
    expect(landings).toHaveLength(1)
    expect(landings[0].geometry.coordinates[0]).toEqual([[9, 15], [11, 15], [11, 17], [9, 17], [9, 15]])
    expect(result.diagnostics.map(d => d.code)).toEqual(authored ? [] : ['STAIR_APPROXIMATE'])
    for (const feature of result.collection.features) {
      const ring = feature.geometry.coordinates[0]
      expect(ring[0]).toEqual(ring[ring.length - 1])
    }
    expect(JSON.stringify(input)).toBe(before)
  })
  it('uses illustrative bounded treads for a real freeform rectangle with a known rise', () => {
    const result = buildStairAssetVolumes([{ ...stair, drawing: undefined, polygon: { points: [{ x: 9, y: 17 }, { x: 11, y: 17 }, { x: 11, y: 23 }, { x: 9, y: 23 }, { x: 9, y: 17 }] } }])
    expect(result.collection.features).toHaveLength(17)
    expect(result.diagnostics).toEqual([expect.objectContaining({ entityId: 'stair', code: 'STAIR_APPROXIMATE' })])
    expect(result.collection.features.at(-1)!.properties!.height).toBe(3)
    expect(result.collection.features.every(f => f.geometry.coordinates[0].every(([x, y]) => x >= 9 && x <= 11 && y >= 17 && y <= 23))).toBe(true)
  })
  it('uses authored steps, centered footprint, floor rise and stable part identity', () => {
    const result = buildStairAssetVolumes([stair], 7)
    expect(result.diagnostics).toEqual([])
    expect(result.collection.features).toHaveLength(4)
    result.collection.features.forEach((feature, index) => {
      expect(feature.properties).toMatchObject({ id: `stair:step:${index}`, featureId: 'stair', partType: 'step', base: 7, height: 7 + (index + 1) * 0.75 })
      expect(feature.geometry.coordinates[0].every(([x, y]) => x >= 9 && x <= 11 && y >= 19 + index * 0.5 && y <= 19.5 + index * 0.5)).toBe(true)
    })
    expect(buildStairAssetVolumes([stair], 7)).toEqual(result)
  })
  it('uses degree rotation and direction while retaining the resolved polygon', () => {
    const rotated = { ...stair, rotation: 90, polygon: { points: [{ x: 11, y: 19 }, { x: 11, y: 21 }, { x: 9, y: 21 }, { x: 9, y: 19 }, { x: 11, y: 19 }] } }
    const positive = buildStairAssetVolumes([rotated]).collection.features
    const negative = buildStairAssetVolumes([{ ...rotated, drawing: { ...stair.drawing!, properties: { ...stair.drawing!.properties, direction: 'north' } } }]).collection.features
    expect(positive).toHaveLength(4)
    expect(Math.min(...positive[0].geometry.coordinates[0].map(p => p[0]))).toBeCloseTo(10.5)
    expect(Math.max(...negative[0].geometry.coordinates[0].map(p => p[0]))).toBeCloseTo(9.5)
  })
  it('retains real landing polygons without inventing dimensions for position-only landings', () => {
    const landing = { position: { x: 12, y: 20 }, polygon: { points: [{ x: 11, y: 19 }, { x: 13, y: 19 }, { x: 13, y: 21 }, { x: 11, y: 21 }, { x: 11, y: 19 }] } }
    const result = buildStairAssetVolumes([{ ...stair, landing }])
    expect(result.collection.features.filter(f => f.properties!.partType === 'landing')).toHaveLength(1)
    expect(result.collection.features.at(-1)!.geometry.coordinates[0]).toEqual(landing.polygon.points.map(p => [p.x, p.y]))
    const positionOnly = buildStairAssetVolumes([{ ...stair, landing: { position: landing.position } }])
    expect(positionOnly.collection.features).toHaveLength(4)
    expect(positionOnly.diagnostics).toEqual([expect.objectContaining({ entityId: 'stair', code: 'missing-landing-polygon' })])
  })
  it.each(['lshape', 'spiral', 'unknown'])('keeps fallback for unsupported %s instead of making a straight flight', preset => {
    const result = buildStairAssetVolumes([{ ...stair, drawing: { ...stair.drawing!, properties: { ...stair.drawing!.properties, preset } } }])
    expect(result.collection.features).toEqual([])
    expect(result.diagnostics).toEqual([expect.objectContaining({ entityId: 'stair', code: 'unsupported-preset' })])
  })
  it('rejects missing dimensions, malformed inputs and excessive counts without mutation', () => {
    const inputs: StairAssetInput[] = [
      { id: 'position-only', position: { x: 0, y: 0 }, rotation: 0 },
      ...[0, -1, NaN, Infinity, 1000000, 2.5].map(stepCount => ({ ...stair, drawing: { ...stair.drawing!, properties: { ...stair.drawing!.properties, stepCount } } })),
      ...[0, -1, Infinity, NaN, undefined].map(height => ({ ...stair, height })),
      { ...stair, rotation: NaN },
      { ...stair, polygon: { points: [{ x: 0, y: 0 }] } },
    ]
    const before = JSON.stringify(inputs)
    const result = buildStairAssetVolumes(inputs)
    expect(result.collection.features).toEqual([])
    expect(result.diagnostics).toHaveLength(inputs.length)
    expect(JSON.stringify(inputs)).toBe(before)
    expect(buildStairAssetVolumes([stair], Infinity).collection.features).toEqual([])
  })
  it('emits finite positive solids and rejects collapsed or overflowing geometry', () => {
    for (const direction of ['north', 'south', 'east', 'west', 'up', 'down']) {
      const result = buildStairAssetVolumes([{ ...stair, rotation: 32, drawing: { ...stair.drawing!, properties: { ...stair.drawing!.properties, direction } } }])
      expect(result.collection.features).toHaveLength(4)
      for (const feature of result.collection.features) {
        expect(feature.geometry.coordinates.flat(2).every(Number.isFinite)).toBe(true)
        expect(feature.properties!.height).toBeGreaterThan(feature.properties!.base)
      }
    }
    for (const patch of [{ position: { x: 1e200, y: 1e200 } }, { height: 1e-300 }]) {
      expect(buildStairAssetVolumes([{ ...stair, ...patch }], 7).collection.features).toHaveLength(0)
    }
  })
})

describe('stairs drawn with the Stair tool on a turned building (owner 2026-11-17: ASU stairs stayed flat)', () => {
  // ASU Computer Science GF stair as saved: its outline is turned ~4° from its saved rotation (-3.06).
  const asu: StairAssetInput = {
    id: 'stair-1-q0je', position: { x: 19.74055251898244, y: -0.15248533204430714 }, rotation: -3.0639647870425315, height: 3.5,
    polygon: { points: [
      { x: 20.531370347365737, y: 3.6319273822009563 }, { x: 18.37405245192349, y: 3.4641221915371716 },
      { x: 18.94973468966782, y: -3.936898046405986 }, { x: 21.107052586972713, y: -3.7690928555093706 },
    ] },
  } as StairAssetInput

  it('still gets climbing steps from its outline', () => {
    const result = buildStairAssetVolumes([asu], 0)
    const steps = result.collection.features.filter((f) => f.properties?.partType === 'step')
    expect(result.diagnostics.map((d) => d.code)).not.toContain('unsupported-footprint')
    expect(steps.length).toBeGreaterThan(1)
    expect(Math.max(...steps.map((f) => Number(f.properties!.height)))).toBeCloseTo(3.5, 6)
  })

  it('the steps stay inside the drawn outline', () => {
    const steps = buildStairAssetVolumes([asu], 0).collection.features.filter((f) => f.properties?.partType === 'step')
    const xs = steps.flatMap((f) => f.geometry.coordinates[0].map((p) => p[0])), ys = steps.flatMap((f) => f.geometry.coordinates[0].map((p) => p[1]))
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(18.374 - 1e-6)
    expect(Math.max(...xs)).toBeLessThanOrEqual(21.108 + 1e-6)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-3.937 - 1e-6)
    expect(Math.max(...ys)).toBeLessThanOrEqual(3.632 + 1e-6)
  })

  it('a shape that is really not a rectangle is still refused', () => {
    const kite = { ...asu, polygon: { points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 3 }, { x: 0, y: 2 }] } } as StairAssetInput
    expect(buildStairAssetVolumes([kite], 0).diagnostics.map((d) => d.code)).toContain('unsupported-footprint')
  })
})
