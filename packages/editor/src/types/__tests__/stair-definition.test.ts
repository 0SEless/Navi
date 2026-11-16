import { describe, expect, it } from 'vitest'
import { StairDefinition, type PrimitiveGeometry } from '../parametric-types'

const component = (props: Record<string, unknown>) => ({ id: 'u', definitionId: 'stair', position: { x: 0, y: 0 }, rotation: 0,
  properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'ushape', ...props } })
const of = <T extends PrimitiveGeometry['type']>(geo: PrimitiveGeometry[], type: T) => geo.filter((g) => g.type === type) as Extract<PrimitiveGeometry, { type: T }>[]

describe('stair definition (2026-11-16)', () => {
  it('Type offers only Straight and U-Shape; Turn, Sides and Top landing are parameters', () => {
    const params = StairDefinition.parameters()
    expect(params.find((p) => p.key === 'preset')!.options!.map((o) => o.value)).toEqual(['straight', 'ushape'])
    expect(params.find((p) => p.key === 'turn')!.options!.map((o) => o.value)).toEqual(['right', 'left'])
    expect(params.find((p) => p.key === 'sides')!.options!.map((o) => o.value)).toEqual(['open', 'railing', 'wall'])
    expect(params.some((p) => p.key === 'topLandingM')).toBe(true)
  })

  it('U-Shape outline is the whole footprint: 4.2 m along the climb, 2.6 m across', () => {
    const rect = of(StairDefinition.geometry(component({})), 'rect')[0]
    expect(rect.width).toBeCloseTo(4.2, 6)
    expect(rect.height).toBeCloseTo(2.6, 6)
  })

  it('U-Shape draws tread lines for both flights, the landing edge, and a U-shaped arrow with two turns', () => {
    const geo = StairDefinition.geometry(component({}))
    const lines = of(geo, 'polyline')
    const arrow = lines.filter((l) => l.points.length >= 4)
    expect(arrow).toHaveLength(1)
    const treads = lines.filter((l) => l.points.length === 2)
    expect(treads.length).toBeGreaterThanOrEqual(20)
    expect(of(geo, 'arrow')).toHaveLength(1)
  })

  it('straight stairs draw as before', () => {
    const geo = StairDefinition.geometry(component({ preset: 'straight', stepCount: 4 }))
    expect(geo.map((g) => g.type)).toEqual(['rect', 'arrow'])
  })
})
