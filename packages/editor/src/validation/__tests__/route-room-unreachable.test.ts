import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { validateRouteNetwork } from '../rules/modules/route-network'

const room = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, number: '', category: 'classroom', polygon: { points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 0, y: 0 }] }, ...extra })

function campus(): CampusDocument {
  return {
    schemaVersion: 1, version: 1, metadata: { campusId: 'c' }, roads: [], panoramas: [], qrCheckpoints: [],
    buildings: [{
      id: 'hall', name: 'Hall', floors: [{
        id: 'f1', level: 0, label: '1F', elevation: 0, height: 3, hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {},
        rooms: [
          room('r-door', 'Lab', {}),
          room('r-old', 'Office', { roomDoors: [{ id: 'd-old', position: { x: 4, y: 2 }, width: 1 }] }),
          room('r-link', 'Library', {}),
          room('r-none', 'Store'),
        ],
        doors: [{ id: 'd-1', roomId: 'r-door', ownership: { status: 'assigned' }, position: { x: 4, y: 2 }, width: 1 }],
        roomAttributes: [{ faceId: 'r-link', roomId: 'r-link', name: 'Library', accessPoints: [{ routeNodeId: 'n1' }] }],
        routeNetwork: { nodes: [{ id: 'n1', type: 'waypoint', position: { x: 5, y: 5 }, floor: 0 }], edges: [] },
      }],
    }],
  } as unknown as CampusDocument
}

describe('route-room-unreachable', () => {
  it('warns about a room with neither a door nor a room link (a warning, also when publishing)', () => {
    const issues = validateRouteNetwork(campus(), 'publish').filter((i) => i.ruleId === 'route-room-unreachable')
    expect(issues.map((i) => i.message)).toEqual(["Room \"Store\" can't be reached: add a door or link it to the floor's route"])
    expect(issues[0].severity).toBe('warning')
  })
})
