import { describe, expect, it } from 'vitest'
import { findTerrainElevationConflicts, isSimpleTerrainPolygon } from './terrain-polygon'
import type { TerrainArea } from '../types/entities'

const area = (id: string, elevationMeters: number, points: TerrainArea['points']): TerrainArea => ({ id, name: id, points, color: '#22aa66', elevationMeters })

describe('terrain polygon geometry', () => {
  it('rejects bow-tie self-intersection and accepts a simple polygon', () => {
    expect(isSimpleTerrainPolygon([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 0, lng: 1 }, { lat: 1, lng: 0 }])).toBe(false)
    expect(isSimpleTerrainPolygon([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 1, lng: 0 }])).toBe(true)
  })

  it('flags overlapping different-elevation areas without merging them', () => {
    const left = area('terrain-left', 1, [{ lat: 0, lng: 0 }, { lat: 0, lng: 2 }, { lat: 2, lng: 2 }, { lat: 2, lng: 0 }])
    const overlap = area('terrain-overlap', 3, [{ lat: 1, lng: 1 }, { lat: 1, lng: 3 }, { lat: 3, lng: 3 }, { lat: 3, lng: 1 }])

    expect(findTerrainElevationConflicts([left, overlap])).toEqual([{ areaIds: ['terrain-left', 'terrain-overlap'], elevationsMeters: [1, 3] }])
    expect(findTerrainElevationConflicts([left, area('same-level', 1, overlap.points)])).toEqual([])
  })
})
