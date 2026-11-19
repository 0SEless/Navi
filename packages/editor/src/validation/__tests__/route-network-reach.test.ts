import { describe, expect, it } from 'vitest'
import type { CampusDocument, Floor, Staircase } from '@navi/core'
import { validateRouteNetwork } from '../rules/modules/route-network'

// Owner 2026-11-19 ASU-IBAJAY check: Studio's checks said "0 problems" while Publish refused the campus (COMDEV
// Floor 3 cut off) and VOAG, single rooms and several stairs were not reachable. These warnings say so in Studio.
const lat0 = 11.818, lng0 = 122.17, kx = 111320 * Math.cos(lat0 * Math.PI / 180)
const world = (x: number, y: number) => ({ lat: lat0 + y / 111320, lng: lng0 + x / kx })
const node = (id: string, x: number, y: number, floor: number) => ({ id, type: 'waypoint' as const, position: { x, y }, floor })
const walk = (id: string, from: string, to: string, distance = 5) => ({ id, from, to, type: 'walk' as const, distance })

function floor(level: number, extra: Partial<Floor> = {}): Floor {
  return {
    id: `f${level}`, level, label: `Floor ${level + 1}`, elevation: level * 3.5, height: 3.5, metadata: {},
    rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], walls: [],
    routeNetwork: { nodes: [node(`a${level}`, -10, 0, level), node(`b${level}`, 10, 0, level)], edges: [walk(`h${level}`, `a${level}`, `b${level}`, 20)] },
    ...extra,
  } as unknown as Floor
}

/** Ground floor entrance at (-10, 0) linked to the outdoor walk (y = -14). `offRoad` moves the link off the walk. */
function linkEntrance(f: Floor, id = 'main', offRoad = 0) {
  f.entrances = [{ id, label: 'Main', position: { x: -10, y: 0 }, level: f.level, type: 'main', hasQR: false, hasPanorama: false }] as never
  f.entranceAccess = [{ entranceId: id, outdoorNodeId: `out-${id}`, indoorRouteNodeId: `a${f.level}`, outdoorRouteId: 'road', outdoorPosition: world(-10, -14 + offRoad) }] as never
}

function doc(floors: Floor[], staircases: Staircase[] = []): CampusDocument {
  return {
    schemaVersion: 2, version: 1, metadata: { campusId: 'c', name: 'C', description: '', lastModified: '', editorVersion: 'test' },
    buildings: [{ id: 'b', name: 'B', footprint: { points: [] }, baseElevation: 0, height: 10, floors, staircases, verticalConnectors: [], aliases: [], metadata: {} }] as never,
    roads: [{ id: 'road', name: 'Walk', polyline: { points: [world(-20, -14), world(20, -14)] }, width: 3, surface: 'paved', type: 'pedestrian', metadata: {} }] as never,
    panoramas: [], qrCheckpoints: [],
  }
}

/** A stair from `from` to `from + 1`; `link` says which ends are joined to their floor's route. */
function stair(id: string, from: number, link: { foot?: boolean; top?: boolean }): Staircase {
  const rc = (level: number) => ({ routeConnection: { anchorNodeId: `${id}-anchor${level}`, targetRouteNodeId: `a${level}`, connectorEdgeId: `${id}-edge${level}` } })
  return { id, buildingId: 'b', name: id, type: 'open', accessible: false, fromLevel: from, toLevel: from + 1,
    levels: { [from]: { position: { x: 0, y: 0 }, rotation: 0, ...(link.foot ? rc(from) : {}) }, [from + 1]: { role: 'top', position: { x: 0, y: 0 }, rotation: 0, ...(link.top ? rc(from + 1) : {}) } } } as unknown as Staircase
}

/** Put a stair's anchor points and connector edges into its floors' routes, as Auto-connect does. */
function addAnchors(floors: Floor[], s: Staircase) {
  for (const [level, geometry] of Object.entries(s.levels)) {
    const link = geometry.routeConnection
    const f = floors.find((candidate) => candidate.level === Number(level))
    if (!link || !f?.routeNetwork) continue
    f.routeNetwork.nodes.push(node(link.anchorNodeId, 0, 0, f.level) as never)
    f.routeNetwork.edges.push(walk(link.connectorEdgeId!, link.anchorNodeId, link.targetRouteNodeId!, 10) as never)
  }
}

const of = (issues: ReturnType<typeof validateRouteNetwork>, ruleId: string) => issues.filter((i) => i.ruleId === ruleId)

describe('a floor visitors cannot reach', () => {
  it('warns when a floor has no outdoor-linked entrance and no stair linked at both ends', () => {
    const floors = [floor(0), floor(1), floor(2)]
    linkEntrance(floors[0])
    const lower = stair('s1', 0, { foot: true, top: true }), upper = stair('s2', 1, { foot: false, top: false })
    addAnchors(floors, lower); addAnchors(floors, upper)
    const issues = validateRouteNetwork(doc(floors, [lower, upper]), 'publish')
    const cut = of(issues, 'route-floor-unreachable')
    expect(cut).toHaveLength(1)
    expect(cut[0]).toMatchObject({ severity: 'warning', floorId: 'f2', buildingId: 'b' })
    expect(cut[0].message).toContain('Floor 3')
  })

  it('accepts an upper floor that has its own entrance from outside (hillside)', () => {
    const floors = [floor(0), floor(1)]
    linkEntrance(floors[0]); linkEntrance(floors[1], 'upper')
    expect(of(validateRouteNetwork(doc(floors), 'publish'), 'route-floor-unreachable')).toEqual([])
  })

  it('accepts floors reached through linked stairs', () => {
    const floors = [floor(0), floor(1), floor(2)]
    linkEntrance(floors[0])
    const s1 = stair('s1', 0, { foot: true, top: true }), s2 = stair('s2', 1, { foot: true, top: true })
    addAnchors(floors, s1); addAnchors(floors, s2)
    const issues = validateRouteNetwork(doc(floors, [s1, s2]), 'publish')
    expect(of(issues, 'route-floor-unreachable')).toEqual([])
    expect(of(issues, 'route-stair-link')).toEqual([])
  })

  it('counts an entrance whose outdoor link is off its road as no way in', () => {
    const floors = [floor(0)]
    linkEntrance(floors[0], 'main', 0.64)
    const issues = validateRouteNetwork(doc(floors), 'publish')
    expect(of(issues, 'route-floor-unreachable')).toHaveLength(1)
    const off = of(issues, 'route-entrance-off-road')
    expect(off).toHaveLength(1)
    expect(off[0]).toMatchObject({ severity: 'warning', floorId: 'f0' })
    expect(off[0].message).toMatch(/0\.6 m/)
  })

  it('keeps an entrance linked right on its road quiet', () => {
    const floors = [floor(0)]
    linkEntrance(floors[0], 'main', 0.2)
    const issues = validateRouteNetwork(doc(floors), 'publish')
    expect(of(issues, 'route-entrance-off-road')).toEqual([])
    expect(of(issues, 'route-floor-unreachable')).toEqual([])
  })
})

describe('stair ends that are not joined to the route', () => {
  it('names the floor and end of each unlinked stair end', () => {
    const floors = [floor(0), floor(1)]
    linkEntrance(floors[0])
    const s = stair('s1', 0, { foot: true, top: false })
    addAnchors(floors, s)
    const links = of(validateRouteNetwork(doc(floors, [s]), 'publish'), 'route-stair-link')
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ severity: 'warning', floorId: 'f1' })
    expect(links[0].message).toMatch(/top/i)
  })

  it('warns about a stair that stands on one floor only and is not linked to a stair above or below', () => {
    const floors = [floor(0), floor(1)]
    linkEntrance(floors[0]); linkEntrance(floors[1], 'upper')
    const lone = { id: 'lone', buildingId: 'b', name: 'Lone', type: 'open', accessible: false, fromLevel: 1, toLevel: 1,
      levels: { 1: { position: { x: 0, y: 0 }, rotation: 0 } } } as unknown as Staircase
    const links = of(validateRouteNetwork(doc(floors, [lone]), 'publish'), 'route-stair-link')
    expect(links).toHaveLength(1)
    expect(links[0].message).toMatch(/only, so visitors can.t use it to change floors/)
  })

  it('accepts two one-floor stairs linked floor to floor (below/above)', () => {
    const floors = [floor(0), floor(1)]
    linkEntrance(floors[0])
    const rc = (id: string, level: number) => ({ routeConnection: { anchorNodeId: `${id}-anchor${level}`, targetRouteNodeId: `a${level}`, connectorEdgeId: `${id}-edge${level}` } })
    const lowerPart = { id: 'lo', buildingId: 'b', name: 'Lo', type: 'open', accessible: false, fromLevel: 0, toLevel: 0, links: { above: 'up' },
      levels: { 0: { position: { x: 0, y: 0 }, rotation: 0, ...rc('lo', 0) } } } as unknown as Staircase
    const upperPart = { id: 'up', buildingId: 'b', name: 'Up', type: 'open', accessible: false, fromLevel: 1, toLevel: 1, links: { below: 'lo' },
      levels: { 1: { position: { x: 0, y: 0 }, rotation: 0, ...rc('up', 1) } } } as unknown as Staircase
    addAnchors(floors, lowerPart); addAnchors(floors, upperPart)
    const issues = validateRouteNetwork(doc(floors, [lowerPart, upperPart]), 'publish')
    expect(of(issues, 'route-stair-link')).toEqual([])
    expect(of(issues, 'route-floor-unreachable')).toEqual([])
  })
})

describe('routes drawn through a wall', () => {
  it('warns when a route line crosses a wall where it has no door', () => {
    const f = floor(0, { walls: [{ id: 'w', start: { x: 0, y: -5 }, end: { x: 0, y: 5 }, height: 3.2, thickness: 0.2 }] as never })
    linkEntrance(f)
    const issues = of(validateRouteNetwork(doc([f]), 'publish'), 'route-through-wall')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ severity: 'warning', floorId: 'f0' })
    expect(issues[0].targets).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: 'h0' }), expect.objectContaining({ entityId: 'w' })]))
  })

  it('accepts a route through a doorway in that wall', () => {
    const f = floor(0, {
      walls: [{ id: 'w', start: { x: 0, y: -5 }, end: { x: 0, y: 5 }, height: 3.2, thickness: 0.2 }] as never,
      openings: [{ id: 'd', type: 'door', wallId: 'w', offset: 4.5, width: 1, height: 2.1, sillHeight: 0 }] as never,
    })
    linkEntrance(f)
    expect(of(validateRouteNetwork(doc([f]), 'publish'), 'route-through-wall')).toEqual([])
  })

  it('does not count a window as a way through', () => {
    const f = floor(0, {
      walls: [{ id: 'w', start: { x: 0, y: -5 }, end: { x: 0, y: 5 }, height: 3.2, thickness: 0.2 }] as never,
      openings: [{ id: 'win', type: 'window', wallId: 'w', offset: 4.5, width: 1, height: 1.2, sillHeight: 0.9 }] as never,
    })
    linkEntrance(f)
    expect(of(validateRouteNetwork(doc([f]), 'publish'), 'route-through-wall')).toHaveLength(1)
  })
})
