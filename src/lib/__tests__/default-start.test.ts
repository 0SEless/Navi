import { describe, expect, it } from 'vitest'
import { defaultStart } from '../default-start'

const node = (id: string, lng: number, extra: Record<string, unknown> = {}) => ({ id, label: '', type: 'waypoint', floor: 0, position: { lat: 11.818, lng }, ...extra })
const gate = { id: 'poi-gate', label: 'ENTRANCE GATE', category: 'other', position: { lat: 11.818, lng: 122.1686 } }

describe('defaultStart', () => {
  it('starts at the outdoor route point nearest the campus entrance gate', () => {
    const start = defaultStart({ nodes: [node('far', 122.172), node('near', 122.1687), node('inside', 122.16861, { buildingId: 'b1' })], poi: [gate] })
    expect(start).toEqual({ nodeId: 'near', label: 'ENTRANCE GATE' })
  })

  it('counts the published outdoor walkway (building id "__outdoor__") as outdoors', () => {
    const start = defaultStart({ nodes: [node('walk', 122.1687, { buildingId: '__outdoor__', type: 'walkway' }), node('inside', 122.16861, { buildingId: 'b1' })], poi: [gate] })
    expect(start?.nodeId).toBe('walk')
  })

  it('also knows a main gate by name', () => {
    expect(defaultStart({ nodes: [node('n', 122.1687)], poi: [{ ...gate, label: 'Main Gate' }] })?.label).toBe('Main Gate')
  })

  it('has no default without a gate on the campus', () => {
    expect(defaultStart({ nodes: [node('n', 122.1687)], poi: [{ ...gate, label: 'BENCH' }] })).toBeNull()
  })
})
