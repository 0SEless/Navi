import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { buildingCreateHandler } from '../building-handlers'

const doc = (): CampusDocument => ({ schemaVersion: 1, version: 0, metadata: { campusId: 'c', name: 'c', description: '', lastModified: '', editorVersion: 't' }, buildings: [], roads: [], panoramas: [], qrCheckpoints: [] }) as unknown as CampusDocument
const open = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }, { lat: 0.001, lng: 0.001 }, { lat: 0.001, lng: 0 }]

describe('building.create saves a closed outline (2026-11-17: "footprint is not closed")', () => {
  it('an open outline from the Building tool is closed (first point repeated at the end)', () => {
    const d = doc()
    expect(buildingCreateHandler.execute(d, { id: 'b', name: 'B', footprint: { points: open } }).success).toBe(true)
    const pts = d.buildings[0].footprint.points
    expect(pts).toHaveLength(5)
    expect(pts[4]).toEqual(pts[0])
  })

  it('an already closed outline is kept as it is', () => {
    const d = doc()
    buildingCreateHandler.execute(d, { id: 'b', name: 'B', footprint: { points: [...open, open[0]] } })
    expect(d.buildings[0].footprint.points).toHaveLength(5)
  })
})
