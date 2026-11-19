import { describe, it, expect } from 'vitest'
import { featureConnectivityRule } from '../rules/modules/feature-rules'

// Save v2 floors draw their indoor routes as Floor.routeNetwork and leave the
// legacy Floor.hallways list empty. A stair next to a route node is connected.
function run(floor0: Record<string, unknown>) {
  const building = {
    id: 'b1',
    floors: [{ id: 'f0', level: 0, rooms: [], hallways: [], ...floor0 }],
    staircases: [{ id: 'st1', type: 'standard', levels: { 0: { position: { x: 0, y: 0 }, rotation: 0 } } }],
    elevators: [],
  }
  return featureConnectivityRule.execute({ document: { buildings: [building] } } as any)
}

const node = (id: string, x: number, y: number) => ({ id, type: 'junction', position: { x, y }, floor: 0 })

describe('feature-connectivity with a floor route network', () => {
  it('passes a stair within 8 m of a route node when the floor has no legacy hallways', () => {
    expect(run({ routeNetwork: { nodes: [node('n1', 3, 0)], edges: [] } })).toHaveLength(0)
  })

  it('reports a stair far from every route node', () => {
    const issues = run({ routeNetwork: { nodes: [node('n1', 40, 0)], edges: [] } })
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('is 40 m from the nearest hallway route')
  })

  it('still reports a floor with neither hallways nor route nodes', () => {
    const issues = run({})
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('has no hallway route on that floor')
  })
})
