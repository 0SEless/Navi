import { describe, expect, it } from 'vitest'
import { suggestStairConnection, toLatLng, type CampusDocument } from '@navi/core'
import { validateRouteNetwork } from '../rules/modules/route-network'
import { stairConnectCommands } from '../../commands/stair-route'
import { stairCampus, stairEditor } from '../../commands/__tests__/stair-fixture'

const grid = { originLat: 11.8, originLng: 122.1 }
const toWorld = (_b: string, _l: number, p: { x: number; y: number }) => toLatLng(grid, p)

function connected(): CampusDocument {
  const document = stairCampus()
  const { dispatcher } = stairEditor(document)
  const commands = stairConnectCommands(document, suggestStairConnection(document, 's1', { toWorld })!)
  if (!Array.isArray(commands)) throw new Error(commands.error)
  dispatcher.executeBatch(commands)
  return document
}
const stairIssues = (document: CampusDocument) => validateRouteNetwork(document, 'publish').filter((i) => i.ruleId === 'route-stair')

describe('route-stair', () => {
  it('a connected, unchanged stair has no issue', () => {
    expect(stairIssues(connected())).toEqual([])
  })

  it('Stair route out of step: the stair was deleted', () => {
    const d = connected()
    d.structures = []
    const [issue] = stairIssues(d)
    expect(issue.message).toBe('Stair route out of step: the stair was deleted')
    expect(issue.severity).toBe('error')
  })

  it('Stair route out of step: the top end is on another floor', () => {
    const d = connected()
    d.structures![0] = { ...d.structures![0], start: { kind: 'slab', buildingId: 'hall', floorId: 'f1', edgeIndex: 1, edgeT: 0.5 } }
    expect(stairIssues(d).map((i) => i.message)).toContain('Stair route out of step: the top end is on another floor')
  })

  it('Stair route out of step: the joined route was deleted', () => {
    const d = connected()
    d.roads = d.roads.filter((r) => r.id !== 'r1')
    d.roadJunctions = (d.roadJunctions ?? []).map((j) => ({ ...j, roadIds: j.roadIds.filter((id) => id !== 'r1') }))
    expect(stairIssues(d).map((i) => i.message)).toContain('Stair route out of step: the joined route was deleted')
  })

  it('Stair route out of step: the entrance was deleted', () => {
    const d = connected()
    d.buildings[0].floors[1].entrances = []
    d.buildings[0].floors[1].entranceAccess = []
    expect(stairIssues(d).map((i) => i.message)).toContain('Stair route out of step: the entrance was deleted')
  })

  it('Stair route out of step: the path end is more than 0.5 m from the stair', () => {
    const d = connected()
    // The building moved 3 m north without the path being recomputed.
    d.buildings[0].footprint = { points: [[0, 3], [20, 3], [20, 13], [0, 13], [0, 3]].map(([x, y]) => toLatLng(grid, { x, y })) }
    expect(stairIssues(d).map((i) => i.message)).toContain('Stair route out of step: the stair moved away from its route')
  })
})
