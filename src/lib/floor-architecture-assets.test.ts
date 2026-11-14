import { describe, expect, it } from 'vitest'
import { CoordinateTransformer } from '@navi/core'
import { buildFloorArchitectureAssets } from './floor-architecture-assets'

describe('floor architecture projection', () => {
  it('projects finite solids once and keeps missing geometry as a fallback', () => {
    const transformer = new CoordinateTransformer()
    transformer.registerBuilding({ buildingId: 'b', origin: { lat: 12, lng: 122 }, rotation: 65 })
    const data = buildFloorArchitectureAssets({ buildingId: 'b', transformer,
      walls: [{ id: 'wall', start: { x: 0, y: 0 }, end: { x: 6, y: 0 }, height: 3, thickness: 0.2 }],
      openings: [], doors: [], stairs: [{ id: 'missing', position: { x: 1, y: 2 }, rotation: 90 }],
    })
    expect(data.modeledIds.walls).toEqual(['wall'])
    expect(data.modeledIds.stairs).toEqual([])
    expect(data.diagnostics.some(d => d.entityId === 'missing')).toBe(true)
    expect(data.walls.features[0].geometry.coordinates[0][0][0]).toBeCloseTo(122, 4)
    expect(data.walls.features.every(f => f.properties!.height > f.properties!.base)).toBe(true)
  })
  it('omits a whole polygon when projection fails instead of closing a partial ring', () => {
    const data = buildFloorArchitectureAssets({ buildingId: 'missing', transformer: { buildingLocalToWorld: () => null }, walls: [{ id: 'wall', start: { x: 0, y: 0 }, end: { x: 6, y: 0 }, height: 3, thickness: 0.2 }], openings: [], doors: [], stairs: [] })
    expect(data.walls.features).toEqual([])
    expect(data.modeledIds.walls).toEqual([])
    expect(data.diagnostics.some(d => d.code === 'PROJECTION_INVALID')).toBe(true)
  })
})

describe('fully consumed walls', () => {
  const wall = { id: 'void-wall', start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, height: 2, thickness: 0.2 }
  const opening = { id: 'full-door', type: 'door' as const, wallId: 'void-wall', offset: 0, width: 1, height: 2 }
  it('handles a valid full-wall aperture without restoring its opaque fallback', () => {
    const transformer = new CoordinateTransformer()
    transformer.registerBuilding({ buildingId: 'b', origin: { lat: 12, lng: 122 }, rotation: 25 })
    const data = buildFloorArchitectureAssets({ buildingId: 'b', transformer, walls: [wall], openings: [opening], doors: [], stairs: [] })
    expect(data.walls.features).toEqual([])
    expect(data.modeledIds.walls).toEqual(['void-wall'])
  })
  it('retains fallback for invalid walls and a full aperture without projection', () => {
    const transformer = new CoordinateTransformer()
    transformer.registerBuilding({ buildingId: 'b', origin: { lat: 12, lng: 122 }, rotation: 25 })
    const data = buildFloorArchitectureAssets({ buildingId: 'b', transformer, walls: [{ ...wall, thickness: 0 }], openings: [opening], doors: [], stairs: [] })
    expect(data.modeledIds.walls).toEqual([])
    const missing = buildFloorArchitectureAssets({ buildingId: 'b', transformer: { buildingLocalToWorld: () => null }, walls: [wall], openings: [opening], doors: [], stairs: [] })
    expect(missing.modeledIds.walls).toEqual([])
    expect(missing.diagnostics.some(d => d.code === 'PROJECTION_INVALID')).toBe(true)
  })
})
