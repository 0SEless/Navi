import { describe, expect, it } from 'vitest'
import { area, booleanPointInPolygon, point } from '@turf/turf'
import { floorArchitectureFeatures, selectFloorArchitecture } from '../FloorArchitectureLayer'
import type { FloorArchitectureRenderData } from '@/components/map/NavigationRenderModel'

const fc = (features: GeoJSON.Feature[] = []) => ({ type: 'FeatureCollection' as const, features })
const poly = (props: Record<string, unknown>): GeoJSON.Feature => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } })
const record = (floor: number, mesh: boolean): FloorArchitectureRenderData => ({
  buildingId: 'b', floor, elevation: floor * 3.5, floorFaces: [],
  walls: fc(), frames: fc(), panels: fc(), glass: fc(),
  stairs: fc([poly({ partType: 'step', base: 0, height: 1 }), poly({ partType: 'top-landing', fromLevel: floor - 1, base: 0, height: 0.05 })]),
  symbols: { lines: fc() as never, markers: fc() as never }, diagnostics: [], modeledIds: { walls: [], doors: [], openings: [], stairs: [] },
  stairMesh: mesh ? { origin: { lat: 12, lng: 122 }, mesh: new Float32Array(9) } : null,
}) as unknown as FloorArchitectureRenderData

describe('NAVI Web smooth stairs', () => {
  it('the stack carries each floor\'s stair mesh', () => {
    const stack = selectFloorArchitecture([record(0, true), record(1, true)], { active: true, buildingId: 'b' }, 1, true)!
    expect(stack.stackStairMeshes).toHaveLength(2)
  })

  it('with meshes, only stair tops are drawn as blocks; without, the blocks stay', () => {
    const smooth = selectFloorArchitecture([record(0, true)], { active: true, buildingId: 'b' }, 0, true)!
    expect(floorArchitectureFeatures(smooth).stairs.features.map((f) => f.properties!.partType)).toEqual(['top-landing'])
    const blocks = selectFloorArchitecture([record(0, false)], { active: true, buildingId: 'b' }, 0, true)!
    expect(floorArchitectureFeatures(blocks).stairs.features).toHaveLength(2)
  })

  it('the upper floor is cut open over an inside stair (owner 2026-11-17: "has no opening")', () => {
    const square = [{ lat: 0, lng: 0 }, { lat: 0, lng: 10 }, { lat: 10, lng: 10 }, { lat: 10, lng: 0 }]
    const well = { type: 'Feature', properties: { kind: 'stairwell' }, geometry: { type: 'LineString', coordinates: [[2, 2], [4, 2], [4, 5], [2, 5], [2, 2]] } }
    const outsideWell = { type: 'Feature', properties: { kind: 'stairwell' }, geometry: { type: 'LineString', coordinates: [[20, 2], [22, 2], [22, 5], [20, 5], [20, 2]] } }
    const one = { ...record(0, true), floorFaces: [square] }
    const two = { ...record(1, true), floorFaces: [square], symbols: { lines: fc([well as never, outsideWell as never]) as never, markers: fc() as never } }
    const stack = selectFloorArchitecture([one, two] as never, { active: true, buildingId: 'b' }, 1, true)!
    const slabs = floorArchitectureFeatures(stack).floor.features as GeoJSON.Feature<GeoJSON.Polygon>[]
    const upper = slabs.filter((f) => f.properties!.base === 3.5)
    expect(upper).toHaveLength(1)
    expect(upper[0].geometry.coordinates).toHaveLength(2)
    expect(slabs.filter((f) => f.properties!.base === 0)[0].geometry.coordinates).toHaveLength(1)
  })

  it('a stair only partly under the upper floor still cuts its part out (owner 2026-11-18: white pieces over the CS stair)', () => {
    const square = [{ lat: 0, lng: 0 }, { lat: 0, lng: 10 }, { lat: 10, lng: 10 }, { lat: 10, lng: 0 }]
    // The well runs from inside the floor (x 8..10) to outside it (x 10..12).
    const well = { type: 'Feature', properties: { kind: 'stairwell' }, geometry: { type: 'LineString', coordinates: [[8, 2], [12, 2], [12, 5], [8, 5], [8, 2]] } }
    const one = { ...record(0, true), floorFaces: [square] }
    const two = { ...record(1, true), floorFaces: [square], symbols: { lines: fc([well as never]) as never, markers: fc() as never } }
    const stack = selectFloorArchitecture([one, two] as never, { active: true, buildingId: 'b' }, 1, true)!
    const upper = (floorArchitectureFeatures(stack).floor.features as GeoJSON.Feature<GeoJSON.Polygon>[]).filter((f) => f.properties!.base === 3.5)
    expect(upper.some((f) => booleanPointInPolygon(point([9, 3.5]), f as never))).toBe(false)
    expect(upper.some((f) => booleanPointInPolygon(point([5, 5]), f as never))).toBe(true)
    expect(upper.reduce((n, f) => n + area(f as never), 0)).toBeLessThan(area({ type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } as never))
  })
})
