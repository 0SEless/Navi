import { describe, expect, it } from 'vitest'
import type { NavRoute, NavRouteStep } from '@/types/route-types'
import { directionAt, directionStarts, describeDirections, isReadablePlaceName, readablePlaceLabel } from '../route-directions'

// Owner 2026-11-18 (user app review): instructions read "walk to N-617", one per route point (28 steps for 191 m),
// and the destination showed as "N-112". Directions must be a few real steps with real names.

const M_LAT = 1 / 111320
const M_LNG = 1 / (111320 * Math.cos((11.8 * Math.PI) / 180))
const at = (x: number, y: number) => ({ lat: 11.8 + y * M_LAT, lng: 122.1 + x * M_LNG })

function route(points: Array<Partial<NavRouteStep> & { x: number; y: number }>): NavRoute {
  const steps: NavRouteStep[] = points.map((p, i) => ({
    nodeId: p.nodeId ?? `N-${100 + i}`, label: p.label ?? `N-${100 + i}`, position: at(p.x, p.y),
    floor: p.floor ?? 0, buildingId: p.buildingId ?? '', type: p.type ?? 'walk',
  }))
  const instructions = steps.map((s, i) => ({
    type: (i === steps.length - 1 ? 'arrive' : 'walk') as 'arrive' | 'walk', text: `walk to ${s.label}`,
    distance: i === 0 ? 0 : Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y),
    fromNode: i > 0 ? steps[i - 1].nodeId : s.nodeId, toNode: s.nodeId,
  }))
  return { path: steps.map((s) => s.nodeId), steps, instructions, totalDistance: instructions.reduce((n, i) => n + i.distance, 0), totalDuration: 0, fromLabel: steps[0].label, toLabel: steps.at(-1)!.label, arrival: { nodeId: steps.at(-1)!.nodeId, label: steps.at(-1)!.label, position: steps.at(-1)!.position, remainingDistance: 0 }, nodeFloors: [0] } as unknown as NavRoute
}

// Gate (0,0) → straight north along a path through many small points → east wall entrance of building B →
// inside, turn east → stairs up to 1F → walk to CS201.
const trip = route([
  { x: 0, y: 0, label: 'Entrance Gate' },
  { x: 0, y: 10 }, { x: 0.5, y: 20 }, { x: 0, y: 30 }, { x: 0, y: 40 },
  { x: 0, y: 45, type: 'entrance', buildingId: 'b', label: 'Entrance' },
  { x: 8, y: 45, buildingId: 'b' }, { x: 16, y: 45, buildingId: 'b' },
  { x: 16, y: 46, buildingId: 'b', type: 'stairs' }, { x: 16, y: 46, buildingId: 'b', floor: 1, type: 'stairs' },
  { x: 16, y: 52, buildingId: 'b', floor: 1, label: 'CS201' },
])
const names = { building: (id: string) => (id === 'b' ? 'Computer Science Building' : undefined), destination: 'CS201' }

describe('readable place names', () => {
  it('route point ids are not names; real names are', () => {
    for (const id of ['N-112', 'N-44', 'n-7', 'wp-12']) expect(isReadablePlaceName(id, id)).toBe(false)
    expect(isReadablePlaceName('N-617', 'node-x')).toBe(false)
    expect(isReadablePlaceName('ComDev Building', 'N-112')).toBe(true)
    expect(isReadablePlaceName('CS201', 'N-44')).toBe(true)
    expect(isReadablePlaceName('', 'N-1')).toBe(false)
  })

  it('the destination label falls back from an id to the place found by search, then the building', () => {
    expect(readablePlaceLabel({ nodeLabel: 'N-112', nodeId: 'N-112', entryLabel: 'COMDEV BUILDING' })).toBe('COMDEV BUILDING')
    expect(readablePlaceLabel({ nodeLabel: 'N-112', nodeId: 'N-112', buildingName: 'ComDev Building' })).toBe('ComDev Building')
    expect(readablePlaceLabel({ nodeLabel: 'Room 301', nodeId: 'N-9', entryLabel: 'X' })).toBe('Room 301')
    expect(readablePlaceLabel({ nodeLabel: 'N-112', nodeId: 'N-112' })).toBe('Your destination')
  })
})

describe('directions: a few real steps instead of one per route point', () => {
  const directions = describeDirections(trip, names)

  it('groups the trip into walk / enter / turn / stairs / arrive', () => {
    expect(directions.map((d) => d.kind)).toEqual(['walk', 'enter', 'turn-right', 'stairs', 'walk', 'arrive'])
  })

  it('never shows a route point id', () => {
    for (const d of directions) expect(d.text).not.toMatch(/N-\d+/)
  })

  it('says what to do in plain words, with rounded distances', () => {
    // The last 5 m into the doorway belong to "Enter …", shown as you approach it.
    expect(directions[0].text).toBe('Walk about 40 m')
    expect(directions[1].text).toBe('Enter Computer Science Building')
    expect(directions[2].text).toBe('Turn right and walk about 15 m')
    expect(directions[3].text).toBe('Take the stairs up to 1F')
    expect(directions[5].text).toBe('Arrive at CS201')
  })

  it('distances add up to the route', () => {
    expect(directions.reduce((n, d) => n + d.distance, 0)).toBeCloseTo(trip.totalDistance, 6)
  })

  it('each route point belongs to exactly one direction', () => {
    const starts = directionStarts(trip)
    expect(starts[0]).toBe(0)
    // Strictly increasing: Next always moves forward.
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeGreaterThan(starts[i - 1])
    expect(directionAt(trip, 0)).toBe(0)
    expect(directionAt(trip, 3)).toBe(0)
    expect(directionAt(trip, trip.steps.length - 1)).toBe(starts.length - 1)
  })
})

describe('entering a building on an upper floor (hillside entrance)', () => {
  // Outside on the ground (floor 0), then straight in through an upper entrance onto floor 3: that is entering, not stairs.
  const hillside = route([
    { x: 0, y: 0, label: 'Main Road' },
    { x: 0, y: 120, floor: 3, buildingId: 'b', type: 'entrance', label: 'East Upper Entrance' },
    { x: 0, y: 150, floor: 3, buildingId: 'b', label: 'CS 301' },
  ])
  const d = describeDirections(hillside, { building: () => 'Computer Science Building', destination: 'CS 301' })

  it('is walk-and-enter, then walk, then arrive (no stairs)', () => {
    expect(d.map((x) => x.kind)).toEqual(['enter', 'walk', 'arrive'])
  })

  it('a long approach says so: "Walk about 120 m and enter …"', () => {
    expect(d[0].text).toBe('Walk about 120 m and enter Computer Science Building')
    expect(d[1].text).toBe('Walk about 30 m')
    expect(d[2].text).toBe('Arrive at CS 301')
  })
})
