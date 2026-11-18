import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { GraphAnalysisPass } from '../rules/analysis'

const start = { lat: 11, lng: 122 }
const join = { lat: 11, lng: 122.0001 }
const end = { lat: 11, lng: 122.0002 }

function campus(linked = true): CampusDocument {
  return {
    metadata: { campusId: 'test' },
    connectivitySemanticsVersion: '1.0.0',
    roads: [{ id: 'road', polyline: { points: [start, join] } }],
    buildings: ['a', 'b'].map(id => ({
      id,
      floors: [{
        id: `floor-${id}`, level: 0, rooms: [], hallways: [], staircases: [], elevators: [],
        entrances: [{ id: `door-${id}` }],
        entranceAccess: id === 'a' || linked ? [{
          entranceId: `door-${id}`, outdoorRouteId: 'road', outdoorPosition: join,
        }] : [],
      }],
      verticalConnectors: [],
    })),
    panoramas: [],
    qrCheckpoints: [],
  } as unknown as CampusDocument
}

describe('campus connectivity analysis', () => {
  const count = (document: CampusDocument) => new GraphAnalysisPass().execute(document).connectedComponentCount

  it('joins two buildings through their entrances onto the same road', () => {
    expect(count(campus())).toBe(1)
    expect(count(campus(false))).toBe(2)
  })

  it('respects authored road junctions and separated crossings', () => {
    const doc = campus()
    doc.roads.push({ ...doc.roads[0], id: 'extension', polyline: { points: [join, end] } })
    expect(count(doc)).toBe(2)
    doc.roadJunctions = [{ id: 'junction', position: join, roadIds: ['road', 'extension'] }]
    expect(count(doc)).toBe(1)
    doc.separatedCrossings = [{ id: 'crossing', position: join, roadIds: ['road', 'extension'] }]
    expect(count(doc)).toBe(2)
  })

  it('counts shared road vertices in a legacy campus', () => {
    const doc = campus()
    delete doc.connectivitySemanticsVersion
    doc.roads.push({ ...doc.roads[0], id: 'extension', polyline: { points: [join, end] } })
    expect(count(doc)).toBe(1)
  })
})
