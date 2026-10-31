import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { terrainAreaCreateHandler, terrainAreaDeleteHandler, terrainAreaUpdateHandler } from '../terrain-area-handlers'

const datum = {
  kind: 'campus-local' as const,
  name: 'NAVI E8.4 synthetic campus datum',
  zeroReference: 'Synthetic reference point at 0.000 m',
  elevationStatus: 'authored-not-surveyed' as const,
}

function document(): CampusDocument {
  return {
    schemaVersion: 1,
    version: 1,
    metadata: { campusId: 'terrain-campus', name: 'Synthetic', description: '', lastModified: '', editorVersion: 'test' },
    buildings: [], roads: [], panoramas: [], qrCheckpoints: [],
  }
}

const points = [{ lat: 1, lng: 2 }, { lat: 1, lng: 2.001 }, { lat: 1.001, lng: 2.001 }, { lat: 1.001, lng: 2 }]

describe('terrain-area command handlers', () => {
  it('creates a stable terrain area with explicit authored datum and finite elevation', () => {
    const doc = document()
    const result = terrainAreaCreateHandler.execute(doc, { id: 'terrain-1', name: 'North lawn', points, color: '#22aa66', elevationMeters: 3.25, datum })

    expect(result.success).toBe(true)
    expect(doc.terrainAreas).toEqual([{ id: 'terrain-1', name: 'North lawn', points, color: '#22aa66', elevationMeters: 3.25 }])
    expect(doc.terrainVerticalDatum).toEqual(datum)
    expect(terrainAreaCreateHandler.inverse?.({ id: 'terrain-1' }, result)).toMatchObject({
      id: 'terrain-area.delete', payload: { areaId: 'terrain-1', restoreAbsent: true, restoreDatum: undefined },
    })
  })

  it.each([
    ['non-finite elevation', { elevationMeters: Number.NaN }],
    ['non-finite coordinate', { points: [{ lat: 1, lng: 2 }, { lat: Number.POSITIVE_INFINITY, lng: 3 }, { lat: 2, lng: 4 }] }],
    ['degenerate polygon', { points: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }] }],
    ['self-intersecting polygon', { points: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 0, lng: 1 }, { lat: 1, lng: 0 }] }],
    ['empty datum label', { datum: { ...datum, name: ' ' } }],
  ])('rejects %s without mutation', (_label, overrides) => {
    const doc = document()
    const result = terrainAreaCreateHandler.execute(doc, { id: 'terrain-1', name: 'North lawn', points, color: '#22aa66', elevationMeters: 3.25, datum, ...overrides })

    expect(result.success).toBe(false)
    expect(doc.terrainAreas).toBeUndefined()
  })

  it('updates geometry and elevation without changing the stable ID', () => {
    const doc = document()
    terrainAreaCreateHandler.execute(doc, { id: 'terrain-1', name: 'North lawn', points, color: '#22aa66', elevationMeters: 3.25, datum })
    const moved = points.map((point) => ({ ...point, lat: point.lat + 0.0001 }))
    const result = terrainAreaUpdateHandler.execute(doc, { areaId: 'terrain-1', changes: { points: moved, elevationMeters: 4 } })

    expect(result.success).toBe(true)
    expect(doc.terrainAreas).toEqual([{ id: 'terrain-1', name: 'North lawn', points: moved, color: '#22aa66', elevationMeters: 4 }])
    expect(terrainAreaUpdateHandler.inverse?.({ areaId: 'terrain-1', changes: { points: moved, elevationMeters: 4 } }, result)?.payload.changes).toMatchObject({ points, elevationMeters: 3.25, datum })
  })

  it('deletes an area and exposes the previous record for undo', () => {
    const doc = document()
    terrainAreaCreateHandler.execute(doc, { id: 'terrain-1', name: 'North lawn', points, color: '#22aa66', elevationMeters: 3.25, datum })
    const result = terrainAreaDeleteHandler.execute(doc, { areaId: 'terrain-1' })

    expect(result.success).toBe(true)
    expect(doc.terrainAreas).toEqual([])
    expect(result.data?.previousArea).toEqual({ id: 'terrain-1', name: 'North lawn', points, color: '#22aa66', elevationMeters: 3.25 })
  })

  it('undoing the first terrain creation restores absent optional terrain fields', () => {
    const doc = document()
    const created = terrainAreaCreateHandler.execute(doc, { id: 'terrain-1', name: 'North lawn', points, color: '#22aa66', elevationMeters: 3.25, datum })
    const inverse = terrainAreaCreateHandler.inverse?.({ id: 'terrain-1' }, created)
    const deleted = terrainAreaDeleteHandler.execute(doc, inverse?.payload ?? {})

    expect(deleted.success).toBe(true)
    expect(doc.terrainAreas).toBeUndefined()
    expect(doc.terrainVerticalDatum).toBeUndefined()
  })
})
