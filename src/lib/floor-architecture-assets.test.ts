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
  it('stair parapets and rails are not drawn as stepped blocks (the smooth stair mesh draws them; owner 2026-11-16)', () => {
    const transformer = new CoordinateTransformer()
    transformer.registerBuilding({ buildingId: 'b', origin: { lat: 12, lng: 122 }, rotation: 0 })
    const stair = (sides: 'wall' | 'railing') => ({ id: 'u', position: { x: 0, y: 0 }, rotation: 0, height: 3.5,
      drawing: { definitionId: 'stair' as const, properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'ushape', sides } } })
    for (const sides of ['wall', 'railing'] as const) {
      const data = buildFloorArchitectureAssets({ buildingId: 'b', transformer, walls: [], openings: [], doors: [], stairs: [stair(sides)] })
      const all = [...data.walls.features, ...data.frames.features, ...data.stairs.features]
      expect(all.some(f => f.properties!.partType === 'parapet' || f.properties!.partType === 'rail')).toBe(false)
      expect(data.stairs.features.filter(f => f.properties!.partType === 'step')).toHaveLength(20)
    }
  })

  it('returns the smooth stair mesh, around the building origin, standing on the floor base', () => {
    const transformer = new CoordinateTransformer()
    transformer.registerBuilding({ buildingId: 'b', origin: { lat: 12, lng: 122 }, rotation: 0 })
    const stair = { id: 'u', position: { x: 0, y: 0 }, rotation: 0, height: 3.5,
      drawing: { definitionId: 'stair' as const, properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'ushape', sides: 'wall' as const } } }
    const data = buildFloorArchitectureAssets({ buildingId: 'b', transformer, walls: [], openings: [], doors: [], stairs: [stair], base: 3.5 })
    expect(data.stairMesh).not.toBeNull()
    expect(data.stairMesh!.mesh.length).toBeGreaterThan(0)
    expect(data.stairMesh!.origin.lat).toBeCloseTo(12, 6)
    let top = -Infinity
    for (let i = 2; i < data.stairMesh!.mesh.length; i += 9) top = Math.max(top, data.stairMesh!.mesh[i])
    expect(top).toBeGreaterThan(3.5 + 3.5)
    expect(buildFloorArchitectureAssets({ buildingId: 'b', transformer, walls: [], openings: [], doors: [], stairs: [] }).stairMesh).toBeNull()
  })
})


describe('outside stairs stand on the ground (owner 2026-11-17: "the stair is still hollow")', () => {
  const transformer = new CoordinateTransformer()
  transformer.registerBuilding({ buildingId: 'b', origin: { lat: 12, lng: 122 }, rotation: 0 })
  const box = [
    { id: 'n', start: { x: 0, y: 10 }, end: { x: 10, y: 10 }, height: 3.5, thickness: 0.2 },
    { id: 'e', start: { x: 10, y: 10 }, end: { x: 10, y: 0 }, height: 3.5, thickness: 0.2 },
    { id: 's', start: { x: 10, y: 0 }, end: { x: 0, y: 0 }, height: 3.5, thickness: 0.2 },
    { id: 'w', start: { x: 0, y: 0 }, end: { x: 0, y: 10 }, height: 3.5, thickness: 0.2 },
  ]
  const stairAt = (x: number) => ({ id: 's', position: { x: x + 0.6, y: 5 }, rotation: 0, height: 3.5,
    polygon: { points: [{ x, y: 2 }, { x: x + 1.2, y: 2 }, { x: x + 1.2, y: 8 }, { x, y: 8 }] } })
  const lowest = (mesh: Float32Array) => { let z = Infinity; for (let i = 2; i < mesh.length; i += 9) z = Math.min(z, mesh[i]); return z }

  it('a stair outside the walls on an upper floor fills down to the ground', () => {
    const data = buildFloorArchitectureAssets({ buildingId: 'b', transformer, walls: box, openings: [], doors: [], stairs: [stairAt(12)], base: 3.5, ground: 0 })
    expect(lowest(data.stairMesh!.mesh)).toBeLessThan(0.01)
  })

  it('a stair inside the walls stops at its own floor', () => {
    const data = buildFloorArchitectureAssets({ buildingId: 'b', transformer, walls: box, openings: [], doors: [], stairs: [stairAt(4)], base: 3.5, ground: 0 })
    expect(lowest(data.stairMesh!.mesh)).toBeGreaterThan(3)
  })
})

it('renders the existing platform edge as a low wall and rail with its hallway opening clear', () => {
  const transformer = new CoordinateTransformer()
  transformer.registerBuilding({ buildingId: 'b', origin: { lat: 12, lng: 122 }, rotation: 0 })
  const assets = buildFloorArchitectureAssets({
    buildingId: 'b', transformer, base: 3.5, doors: [], stairs: [],
    walls: [{ id: 'platform-edge', start: { x: 0, y: 0 }, end: { x: 8, y: 0 }, height: 3.5, thickness: 0.2, guardStyle: 'half-wall' }],
    openings: [{ id: 'hallway-gap', type: 'door', wallId: 'platform-edge', offset: 3, width: 2, height: 2.1, doorAppearance: 'open' }],
  })
  expect(assets.modeledIds.walls).toContain('platform-edge')
  const raised = assets.walls.features.map(piece => {
    expect(piece.properties!.height).toBeLessThan(4.55)
    return piece.geometry.coordinates[0].map(([lng, lat]) => transformer.worldToBuildingLocal({ lng, lat }, 'b')!.x)
  })
  expect(raised.some(xs => Math.max(...xs) - Math.min(...xs) > 2.9 && Math.max(...xs) < 3.1)).toBe(true)
  expect(raised.some(xs => Math.max(...xs) - Math.min(...xs) > 2.9 && Math.min(...xs) > 4.9)).toBe(true)
  expect(raised.every(xs => Math.max(...xs) < 3.1 || Math.min(...xs) > 4.9)).toBe(true)
})
