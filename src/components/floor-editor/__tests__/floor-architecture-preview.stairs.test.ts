import { describe, expect, it } from 'vitest'
import { CoordinateTransformer, type Floor, type Staircase } from '@navi/core'
import { buildFloorArchitecturePreview } from '../floor-architecture-preview'

const transformer = new CoordinateTransformer()
transformer.registerBuilding({ buildingId: 'b', origin: { lat: 12, lng: 122 }, rotation: 0 })
const floor = (level: number, elevation: number) => ({ id: `f${level}`, level, label: `Floor ${level}`, elevation, height: 3.5, rooms: [], hallways: [], staircases: [], elevators: [], doors: [], pois: [], qrCheckpoints: [], walls: [], openings: [] }) as unknown as Floor
const drawing = { definitionId: 'stair' as const, properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'ushape' } }
const stair: Staircase = { id: 's', buildingId: 'b', name: 'Stair', type: 'open', accessible: false, fromLevel: 1, toLevel: 2,
  levels: { 1: { position: { x: 0, y: 0 }, rotation: 0, drawing }, 2: { role: 'top', position: { x: 0, y: 0 }, rotation: 0 } } }
const floors = [floor(1, 0), floor(2, 3.5)]

describe('floor editor preview stairs', () => {
  it('floor 1 draws the 20 steps; floor 2 draws no steps, only the top landing and the stairwell', () => {
    const one = buildFloorArchitecturePreview(floors[0], 'b', transformer, [stair], floors)
    expect(one.stairs.features.filter(f => f.properties!.partType === 'step')).toHaveLength(20)
    const two = buildFloorArchitecturePreview(floors[1], 'b', transformer, [stair], floors)
    expect(two.stairs.features.filter(f => f.properties!.partType === 'step')).toHaveLength(0)
    expect(two.stairs.features.filter(f => f.properties!.partType === 'top-landing')).toHaveLength(1)
    expect(two.symbols.lines.features.filter(f => f.properties!.kind === 'stairwell')).toHaveLength(1)
  })
})
