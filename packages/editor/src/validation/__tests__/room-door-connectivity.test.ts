import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CampusDocument, Floor, RoomDoor } from '@navi/core'
import { recordChange } from '@navi/core'
import { ValidationEngine } from '../validation-engine'
import { roomDoorConnectivityRule } from '../rules/modules/room-door-connectivity'

function door(id: string, patch: Partial<RoomDoor> = {}): RoomDoor {
  return { id, roomId: 'room-1', connectedToType: 'room', doorType: 'standard', position: { x: 0, y: 0 }, width: 0.9, metadata: {}, ...patch }
}

function fixture(doors: RoomDoor[] = [door('door-1')]): CampusDocument {
  return {
    schemaVersion: 1, version: 0,
    metadata: { campusId: 'test', name: 'Test', description: '', lastModified: '', editorVersion: '' },
    buildings: [{
      id: 'building-1', name: 'Teaching', code: '', category: 'academic', description: '',
      footprint: { points: [] }, baseElevation: 0, height: 4, color: '', aliases: [], metadata: {}, verticalConnectors: [],
      floors: [{
        id: 'floor-1', level: 0, label: 'Ground', elevation: 0, offset: { x: 0, y: 0 },
        rooms: [{ id: 'room-1', name: 'Classroom', number: '', category: 'classroom', polygon: { points: [] }, roomDoors: [], metadata: {} }],
        hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], metadata: {}, doors,
        routeNetwork: {
          nodes: [
            { id: 'anchor', type: 'portal', floor: 0, position: { x: 0, y: 0 } },
            { id: 'target', type: 'waypoint', floor: 0, position: { x: 1, y: 0 } },
          ],
          edges: [{ id: 'connector', from: 'anchor', to: 'target', type: 'walk', distance: 1 }],
        },
      }],
    }],
    roads: [], panoramas: [], qrCheckpoints: [],
  } as CampusDocument
}

const connection = { anchorNodeId: 'anchor', targetRouteNodeId: 'target', connectorEdgeId: 'connector' }
const floorOf = (doc: CampusDocument): Floor => doc.buildings[0].floors[0]
const validate = (document: CampusDocument, profile: 'draft' | 'publish' | 'strict' = 'draft') => roomDoorConnectivityRule.execute({ document, profile, analysis: {}, config: { tolerances: {}, severityOverrides: {} } })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('door connection validation', () => {
  it('gives doors in the same room unique stable issue identities with scope', () => {
    const doc = fixture([door('door-1', { connectedToId: 'missing' }), door('door-2', { connectedToId: 'missing' })])
    const first = validate(doc)
    expect(first).toHaveLength(2)
    expect(new Set(first.map(issue => issue.issueId)).size).toBe(2)
    expect(first[0]).toMatchObject({ buildingId: 'building-1', floorId: 'floor-1', layer: 'access' })
    expect(first[0].targets).toContainEqual({ entityId: 'door-1', entityType: 'door' })
    floorOf(doc).doors!.reverse()
    floorOf(doc).rooms[0].name = 'Renamed'
    expect(validate(doc).map(issue => issue.issueId).sort()).toEqual(first.map(issue => issue.issueId).sort())
    floorOf(doc).doors = [floorOf(doc).doors![0]]
    expect(first.map(issue => issue.issueId)).toContain(validate(doc)[0].issueId)
  })

  it('renders and rerenders door issues without duplicate React key errors', () => {
    const doc = fixture([door('door-1'), door('door-2')])
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const list = () => createElement('ul', null, ...validate(doc).map(issue => createElement('li', { key: issue.issueId }, issue.message)))
    const view = render(list())
    view.rerender(list())
    expect(error.mock.calls.filter(args => args.map(String).join(' ').includes('same key'))).toHaveLength(0)
  })

  it.each(['draft', 'publish', 'strict'] as const)('accepts a valid modern connection with empty legacy destination in %s', profile => {
    expect(validate(fixture([door('door-1', { routeConnection: connection })]), profile)).toEqual([])
  })

  it('does not fall back to legacy links when an assigned modern connection is broken', () => {
    const doc = fixture([door('door-1', { routeConnection: { ...connection, targetRouteNodeId: 'gone' }, connectedToId: 'room-1' })])
    expect(validate(doc)).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'error', message: expect.stringContaining('gone') })]))
  })

  it.each([
    ['anchor', { ...connection, anchorNodeId: 'missing-anchor' }],
    ['target', { ...connection, targetRouteNodeId: 'missing-target' }],
    ['connector', { ...connection, connectorEdgeId: 'missing-connector' }],
  ])('reports a missing modern %s as an error', (_part, routeConnection) => {
    const issues = validate(fixture([door('door-1', { routeConnection })]))
    expect(issues.some(issue => issue.severity === 'error')).toBe(true)
  })

  it('checks that the recorded edge joins the recorded anchor and target', () => {
    const doc = fixture([door('door-1', { routeConnection: connection })])
    floorOf(doc).routeNetwork!.edges[0].to = 'anchor'
    expect(validate(doc).some(issue => issue.severity === 'error')).toBe(true)
  })

  it('accepts the opposite edge endpoint order', () => {
    const doc = fixture([door('door-1', { routeConnection: connection })])
    Object.assign(floorOf(doc).routeNetwork!.edges[0], { from: 'target', to: 'anchor' })
    expect(validate(doc)).toEqual([])
  })

  it.each(['anchor', 'target'])('rejects a modern %s node declaring another floor', id => {
    const doc = fixture([door('door-1', { routeConnection: connection })])
    floorOf(doc).routeNetwork!.nodes.find(node => node.id === id)!.floor = 1
    expect(validate(doc).some(issue => issue.severity === 'error')).toBe(true)
  })

  it('does not resolve a target from another floor', () => {
    const doc = fixture([door('door-1', { routeConnection: connection })])
    const other = structuredClone(floorOf(doc))
    other.id = 'floor-2'; other.level = 1
    floorOf(doc).routeNetwork!.nodes = floorOf(doc).routeNetwork!.nodes.filter(node => node.id !== 'target')
    doc.buildings[0].floors.push(other)
    expect(validate(doc).some(issue => issue.floorId === 'floor-1' && issue.severity === 'error')).toBe(true)
  })

  it('treats empty or malformed modern assignment fields as errors, without throwing', () => {
    const doc = fixture([door('door-1', { routeConnection: { ...connection, anchorNodeId: '' } })])
    expect(validate(doc).some(issue => issue.severity === 'error')).toBe(true)
  })

  it('reports an unassigned door as mapping work when an indoor network exists', () => {
    const issues = validate(fixture())
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ severity: 'warning', message: expect.stringMatching(/no route assigned/i) })
  })

  it.each([undefined, { nodes: [], edges: [] }, { nodes: [{ id: 'only', type: 'waypoint' as const, floor: 0, position: { x: 0, y: 0 } }], edges: [] }])('summarizes an absent or undrawn network once per populated floor', network => {
    const doc = fixture([door('door-1'), door('door-2')])
    floorOf(doc).routeNetwork = network
    const issues = validate(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ severity: 'warning', floorId: 'floor-1' })
    expect(issues[0].message).toMatch(/indoor route network/i)
    expect(issues[0].targets).toContainEqual({ entityId: 'floor-1', entityType: 'floor' })
  })

  it('keeps an assigned broken connection an error even when the network is absent', () => {
    const doc = fixture([door('door-1', { routeConnection: connection })])
    floorOf(doc).routeNetwork = undefined
    expect(validate(doc).some(issue => issue.severity === 'error')).toBe(true)
  })

  it('does not warn for an empty building shell', () => {
    const doc = fixture([])
    floorOf(doc).rooms = []; floorOf(doc).routeNetwork = undefined
    expect(validate(doc)).toEqual([])
  })

  it('recognizes saved semantic room identity when derived rooms are absent', () => {
    const doc = fixture([door('door-1', { connectedToId: 'room-1' })])
    floorOf(doc).rooms = []
    floorOf(doc).roomAttributes = [{ faceId: 'face-1', roomId: 'room-1', name: 'Classroom', searchable: true }]
    expect(validate(doc)).toEqual([])
  })

  it('uses canonical semantic room IDs when a saved room has no explicit roomId', () => {
    const doc = fixture([door('door-1', { connectedToId: 'semantic-room-face-1' })])
    floorOf(doc).rooms = []
    floorOf(doc).roomAttributes = [{ faceId: 'face-1', name: 'Classroom', searchable: true }]
    expect(validate(doc)).toEqual([])
  })

  it.each([42, {}, false, null])('keeps malformed explicit legacy destination %j as an error', value => {
    const doc = fixture([door('door-1', { connectedToId: value as unknown as string })])
    expect(validate(doc).some(issue => issue.severity === 'error')).toBe(true)
  })
  it.each(['room', 'hallway'] as const)('preserves errors for an explicit missing legacy %s reference', connectedToType => {
    const issues = validate(fixture([door('door-1', { connectedToType, connectedToId: 'missing' })]))
    expect(issues.some(issue => issue.severity === 'error' && issue.message.includes('missing'))).toBe(true)
  })

  it('accepts valid legacy hallways without requiring a modern route network', () => {
    const doc = fixture([door('door-1', { connectedToType: 'hallway', connectedToId: 'hall-1' })])
    floorOf(doc).routeNetwork = undefined
    floorOf(doc).hallways = [{ id: 'hall-1', name: 'Hall', polyline: { points: [{ x: 0, y: 0 }, { x: 2, y: 0 }] }, width: 2, metadata: {} }]
    expect(validate(doc)).toEqual([])
  })

  it('uses extracted floor doors as authoritative, with nested doors as a legacy fallback', () => {
    const doc = fixture([door('extracted', { routeConnection: connection })])
    floorOf(doc).rooms[0].roomDoors = [door('nested', { connectedToId: 'missing' })]
    expect(validate(doc)).toEqual([])
    floorOf(doc).doors = undefined
    expect(validate(doc).some(issue => issue.severity === 'error')).toBe(true)
  })

  it('revalidates door connections after a route-edge-only edit', () => {
    const doc = fixture([door('door-1', { routeConnection: connection })])
    const engine = new ValidationEngine()
    engine.registerRule(roomDoorConnectivityRule)
    engine.initialize()
    expect(engine.validate(doc, 'draft').issues).toEqual([])
    floorOf(doc).routeNetwork!.edges = []
    recordChange(doc, { entityId: 'connector', entityType: 'route-edge', operation: 'deleted' })
    expect(engine.validate(doc, 'draft').issues.some(issue => issue.severity === 'error')).toBe(true)
  })
  it('never mutates the document while validating', () => {
    const doc = fixture([door('door-1', { routeConnection: connection }), door('door-2')])
    const before = JSON.stringify(doc)
    validate(doc); validate(doc, 'publish')
    expect(JSON.stringify(doc)).toBe(before)
  })
})
