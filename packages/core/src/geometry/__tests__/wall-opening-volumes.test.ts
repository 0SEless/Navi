import { describe, expect, it } from 'vitest'
import type { Opening, RoomDoor, Wall, Window } from '../../types/entities'
import { buildWallOpeningVolumes } from '../wall-opening-volumes'

const wall = (patch: Partial<Wall> = {}): Wall => ({ id: 'wall-1', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, thickness: 0.2, height: 3, ...patch })
const opening = (patch: Partial<Opening> = {}): Opening => ({ id: 'opening-1', type: 'window', wallId: 'wall-1', offset: 4, width: 2, height: 1, sillHeight: 1, ...patch })
const attachedDoor = (patch = {}) => ({ id: 'door-1', doorType: 'standard', roomId: 'room-1', position: { x: 5, y: 0 }, width: 2, metadata: {}, wallAttachment: { wallId: 'wall-1', offset: 5, openingHeight: 2 }, ...patch }) as RoomDoor & { wallAttachment: { wallId: string; offset: number; openingHeight: number } }
const legacyWindow = (patch: Partial<Window> = {}): Window => ({ id: 'window-1', wallId: 'wall-1', offset: 4, width: 2, sillHeight: 1, metadata: {}, ...patch })

type Result = ReturnType<typeof buildWallOpeningVolumes>
function volume(result: Result): number {
  return result.collection.features.reduce((sum, feature) => {
    const ring = (feature.geometry as GeoJSON.Polygon).coordinates[0]
    const area = Math.abs(ring.slice(1).reduce((acc, point, i) => acc + ring[i][0] * point[1] - point[0] * ring[i][1], 0)) / 2
    return sum + area * (Number(feature.properties!.height) - Number(feature.properties!.base))
  }, 0)
}
function checkSolids(result: Result) {
  for (const feature of result.collection.features) {
    expect(Number(feature.properties!.height)).toBeGreaterThan(Number(feature.properties!.base))
    expect((feature.geometry as GeoJSON.Polygon).coordinates.flat(2).every(Number.isFinite)).toBe(true)
  }
}
const build = (openings: Opening[] = [], doors: RoomDoor[] = [], windows: Window[] = [], base = 0, walls = [wall()]) => buildWallOpeningVolumes(walls, openings, doors, windows, base)

describe('wall opening solid volumes', () => {
  it('preserves a plain wall footprint and its original feature identity', () => {
    const result = build()
    expect(result.diagnostics).toEqual([])
    expect(result.collection.features).toHaveLength(1)
    expect(result.collection.features[0].properties).toMatchObject({ id: 'wall-1', wallId: 'wall-1', base: 0, height: 3 })
    expect(volume(result)).toBeCloseTo(6)
  })
  it('carves a centered door span and retains its lintel', () => {
    const result = build([], [attachedDoor()])
    expect(volume(result)).toBeCloseTo(5.2)
    expect(result.collection.features.some(feature => feature.properties!.base === 2 && feature.properties!.height === 3)).toBe(true)
    checkSolids(result)
  })
  it('carves a leading-edge window span and retains sill and header', () => {
    const result = build([opening()])
    expect(volume(result)).toBeCloseTo(5.6)
    const vertical = result.collection.features.map(feature => [feature.properties!.base, feature.properties!.height])
    expect(vertical).toContainEqual([0, 1])
    expect(vertical).toContainEqual([2, 3])
  })
  it('uses the door center convention instead of treating it as a leading edge', () => {
    const result = build([], [attachedDoor({ wallAttachment: { wallId: 'wall-1', offset: 1, openingHeight: 3 } })])
    expect(volume(result)).toBeCloseTo(4.8)
    expect(result.collection.features).toHaveLength(1)
    const ring = (result.collection.features[0].geometry as GeoJSON.Polygon).coordinates[0]
    expect(Math.min(...ring.map(point => point[0]))).toBeCloseTo(2)
  })
  it('supports full-height openings without zero-height leftovers', () => {
    const result = build([opening({ type: 'door', height: 3, sillHeight: 0 })])
    expect(volume(result)).toBeCloseTo(4.8)
    expect(result.collection.features).toHaveLength(2)
    checkSolids(result)
  })
  it('unions overlapping apertures rather than subtracting their overlap twice', () => {
    const result = build([opening({ offset: 2, width: 3 }), opening({ id: 'opening-2', offset: 4, width: 3 })])
    expect(volume(result)).toBeCloseTo(5)
    expect(result.diagnostics.some(diagnostic => diagnostic.code === 'APERTURE_OVERLAP')).toBe(true)
    checkSolids(result)
  })
  it('unions overlaps with different sill and head heights', () => {
    const result = build([opening({ offset: 2, width: 3 }), opening({ id: 'opening-2', offset: 4, width: 3, sillHeight: 1.5 })])
    expect(volume(result)).toBeCloseTo(4.9)
    checkSolids(result)
  })
  it('deduplicates identical canonical and legacy aperture representations', () => {
    const result = build([opening({ height: 1.2 })], [], [legacyWindow()])
    expect(volume(result)).toBeCloseTo(5.52)
    expect(result.diagnostics.some(diagnostic => diagnostic.code === 'APERTURE_OVERLAP')).toBe(false)
  })
  it('uses a render-only 1.2m height for a legacy window on a known wall', () => {
    const result = build([], [], [legacyWindow()])
    expect(volume(result)).toBeCloseTo(5.52)
  })
  it('does not guess a canonical host for composite legacy wall references', () => {
    const result = build([], [], [legacyWindow({ wallId: 'room:room-1:0' })])
    expect(volume(result)).toBeCloseTo(6)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ entityId: 'window-1', code: 'APERTURE_HOST_MISSING' }))
  })
  it('keeps unattached spatial doors from carving guessed holes', () => {
    const door = { ...attachedDoor(), wallAttachment: undefined }
    expect(volume(build([], [door]))).toBeCloseTo(6)
  })
  it('clamps legacy render spans to the wall and reports the correction', () => {
    const result = build([opening({ offset: -1, width: 3, sillHeight: -1, height: 3 })])
    expect(volume(result)).toBeCloseTo(5.2)
    expect(result.diagnostics.some(diagnostic => diagnostic.code === 'APERTURE_CLAMPED')).toBe(true)
    checkSolids(result)
  })
  it.each([NaN, Infinity, -1, 0])('ignores invalid aperture width %s with a diagnostic', width => {
    const result = build([opening({ width })])
    expect(volume(result)).toBeCloseTo(6)
    expect(result.diagnostics.some(diagnostic => diagnostic.code === 'APERTURE_INVALID')).toBe(true)
    checkSolids(result)
  })
  it('omits an aperture completely outside its wall', () => {
    const result = build([opening({ offset: 20 })])
    expect(volume(result)).toBeCloseTo(6)
    expect(result.diagnostics.some(diagnostic => diagnostic.code === 'APERTURE_INVALID')).toBe(true)
  })
  it('rejects invalid walls and invalid base heights without non-finite geometry', () => {
    expect(build([], [], [], 0, [wall({ end: { x: 0, y: 0 } })]).collection.features).toEqual([])
    const result = build([], [], [], NaN)
    expect(result.collection.features).toEqual([])
    expect(result.diagnostics.some(diagnostic => diagnostic.code === 'BASE_INVALID')).toBe(true)
  })
  it('omits walls whose finite dimensions overflow or collapse at the supplied base', () => {
    expect(build([], [], [], 1e308, [wall({ height: 1e308 })]).collection.features).toEqual([])
    expect(build([], [], [], 1e308).collection.features).toEqual([])
    checkSolids(build([opening()], [], [], 1e16))
  })
  it('uses the supplied base once, for ground or stacked floors', () => {
    const result = build([opening()], [], [], 7)
    expect(volume(result)).toBeCloseTo(5.6)
    expect(result.collection.features.every(feature => Number(feature.properties!.base) >= 7 && Number(feature.properties!.height) <= 10)).toBe(true)
  })
  it('produces correct diagonal footprints and volume', () => {
    const result = build([], [], [], 0, [wall({ end: { x: 6, y: 8 } })])
    expect(volume(result)).toBeCloseTo(6)
    const ring = (result.collection.features[0].geometry as GeoJSON.Polygon).coordinates[0]
    expect(ring[0]).toEqual([-0.08000000000000002, 0.06])
  })
  it('has stable piece identities independent of aperture input order', () => {
    const apertures = [opening({ offset: 1 }), opening({ id: 'opening-2', offset: 6 })]
    const forward = build(apertures)
    const reverse = build([...apertures].reverse())
    expect(reverse).toEqual(forward)
    expect(new Set(forward.collection.features.map(feature => feature.properties!.id)).size).toBe(forward.collection.features.length)
  })
  it('does not mutate walls, doors, or either opening representation', () => {
    const walls = [wall()], openings = [opening()], doors = [attachedDoor()], windows = [legacyWindow()]
    const before = JSON.stringify({ walls, openings, doors, windows })
    buildWallOpeningVolumes(walls, openings, doors, windows, 0)
    expect(JSON.stringify({ walls, openings, doors, windows })).toBe(before)
  })
})
