import { describe, expect, it } from 'vitest'
import { gridOriginForBoundary, type CampusDocument } from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'
import { executeWithStart, FLAT_REFERENCE, openRing, sameBoundary, startCommands, viewDocument } from '../terrain-start'

const ring = [{ lat: 11.817, lng: 122.168 }, { lat: 11.8175, lng: 122.1697 }, { lat: 11.8189, lng: 122.1732 }, { lat: 11.8183, lng: 122.1731 }]

function doc(extra: Partial<CampusDocument> = {}): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: { campusId: 'c1' }, buildings: [], roads: [], panoramas: [], qrCheckpoints: [],
    ...extra,
  } as unknown as CampusDocument
}

const stroke: Command = { id: 'terrain.apply-tiles', label: 'Raise', payload: { tiles: {} } }

describe('openRing / sameBoundary', () => {
  it('drops the repeated closing point', () => {
    expect(openRing([...ring, ring[0]])).toEqual(ring)
    expect(openRing(ring)).toEqual(ring)
  })

  it('compares open rings and treats missing as different from a ring', () => {
    expect(sameBoundary(ring, [...ring, ring[0]])).toBe(true)
    expect(sameBoundary(ring, ring.slice(0, 3))).toBe(false)
    expect(sameBoundary(null, ring)).toBe(false)
    expect(sameBoundary(undefined, null)).toBe(true)
  })
})

describe('viewDocument', () => {
  it('returns the same object when boundary and terrain exist', () => {
    const d = doc({ boundary: { points: ring }, terrain: { reference: { name: 'x', zeroMeaning: 'y' }, grid: { originLat: 1, originLng: 2 }, colorRange: { minM: 0, maxM: 1 } } } as Partial<CampusDocument>)
    expect(viewDocument(d, ring)).toBe(d)
  })

  it('uses the settings boundary and a flat Campus ground terrain', () => {
    const d = doc()
    const view = viewDocument(d, ring)
    expect(view.boundary?.points).toEqual(ring)
    expect(view.terrain?.reference).toEqual(FLAT_REFERENCE)
    expect(view.terrain?.grid).toEqual(gridOriginForBoundary(ring))
    expect(view.terrain?.colorRange).toEqual({ minM: 0, maxM: 40 })
    expect(d.boundary).toBeUndefined()
    expect(d.terrain).toBeUndefined()
  })

  it('without any boundary adds no terrain', () => {
    const view = viewDocument(doc(), null)
    expect(view.terrain).toBeUndefined()
    expect(view.boundary).toBeUndefined()
  })
})

describe('startCommands', () => {
  it('before a first stroke: boundary.set then terrain.setup', () => {
    const commands = startCommands(doc(), ring, stroke)
    expect(commands.map((c) => c.id)).toEqual(['boundary.set', 'terrain.setup'])
    expect(commands[0].payload).toEqual({ points: ring })
    expect(commands[1].payload).toEqual({ reference: FLAT_REFERENCE })
  })

  it('for an import adds only the boundary', () => {
    expect(startCommands(doc(), ring, { id: 'terrain.setup', label: 'Import', payload: {} }).map((c) => c.id)).toEqual(['boundary.set'])
  })

  it('for a stair adds nothing', () => {
    expect(startCommands(doc(), ring, { id: 'structure.create', label: 'Stair', payload: {} })).toEqual([])
  })

  it('with the document boundary present only adds the flat terrain', () => {
    expect(startCommands(doc({ boundary: { points: ring } }), null, stroke).map((c) => c.id)).toEqual(['terrain.setup'])
  })
})

describe('executeWithStart', () => {
  it('runs boundary, terrain, then the stroke in that order', () => {
    const ran: string[] = []
    const result = executeWithStart((c) => { ran.push(c.id); return { success: true } }, doc(), ring, stroke)
    expect(ran).toEqual(['boundary.set', 'terrain.setup', 'terrain.apply-tiles'])
    expect(result.success).toBe(true)
  })

  it('stops at the first refusal', () => {
    const ran: string[] = []
    const refusal: MutationResult = { success: false, error: 'No' }
    const result = executeWithStart((c) => { ran.push(c.id); return c.id === 'boundary.set' ? refusal : { success: true } }, doc(), ring, stroke)
    expect(result).toBe(refusal)
    expect(ran).toEqual(['boundary.set'])
  })
})
