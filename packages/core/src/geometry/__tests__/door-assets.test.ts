import { describe, expect, it } from 'vitest'
import type { Opening, Wall } from '../../types/entities'
import { buildDoorAssetVolumes, type DoorAssetInput } from '../door-assets'

const wall: Wall = { id: 'wall', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, thickness: 0.2, height: 3 }
const opening = (extra: Partial<Opening> & Pick<DoorAssetInput, 'doorAppearance' | 'doorPose'> = {}) => ({ id: 'opening', type: 'door' as const, wallId: wall.id, offset: 2, width: 1, height: 2, ...extra })
const attached = (extra: Partial<DoorAssetInput> = {}): DoorAssetInput => ({ id: 'door', width: 1, wallAttachment: { wallId: wall.id, offset: 2.5, openingHeight: 2 }, ...extra })
const all = (result: ReturnType<typeof buildDoorAssetVolumes>) => [...result.frames.features, ...result.panels.features, ...result.glass.features]

describe('buildDoorAssetVolumes', () => {
  it('fits three frame pieces in the aperture and puts a thin solid leaf 30 degrees ajar from its hinge', () => {
    const source = opening({ doorPose: 'ajar' })
    const before = JSON.stringify(source)
    const result = buildDoorAssetVolumes([wall], [source], [], 4)
    expect(result.frames.features).toHaveLength(3)
    expect(result.panels.features).toHaveLength(1)
    expect(result.glass.features).toHaveLength(0)
    for (const frame of result.frames.features) {
      expect(frame.properties?.base).toBeGreaterThanOrEqual(4)
      expect(frame.properties?.height).toBeLessThanOrEqual(6)
      for (const [x, y] of frame.geometry.coordinates[0]) {
        expect(x).toBeGreaterThanOrEqual(2)
        expect(x).toBeLessThanOrEqual(3)
        expect(Math.abs(y)).toBeLessThanOrEqual(0.1)
      }
    }
    const [a, b] = result.panels.features[0].geometry.coordinates[0]
    expect(Math.atan2(b[1] - a[1], b[0] - a[0])).toBeCloseTo(Math.PI / 6)
    expect(JSON.stringify(source)).toBe(before)
    expect(source).not.toHaveProperty('doorAppearance')
  })

  it('open keeps its frame and glass has a transparent pane with only border solids', () => {
    const open = buildDoorAssetVolumes([wall], [opening({ doorAppearance: 'open' })], [])
    expect(open.frames.features).toHaveLength(3)
    expect(open.panels.features).toHaveLength(0)
    expect(open.glass.features).toHaveLength(0)
    const glass = buildDoorAssetVolumes([wall], [opening({ doorAppearance: 'glass' })], [])
    expect(glass.glass.features).toHaveLength(1)
    expect(glass.panels.features).toHaveLength(0)
    expect(glass.frames.features).toHaveLength(7)
  })

  it('deduplicates matching attached center-offset and opening start-offset records', () => {
    const result = buildDoorAssetVolumes([wall], [opening()], [attached()])
    expect(result.panels.features).toHaveLength(1)
    expect(result.panels.features[0].properties).toMatchObject({ openingId: 'opening', doorId: 'door', wallId: 'wall' })
  })

  it('deduplicates explicit identity even when legacy geometry differs', () => {
    const result = buildDoorAssetVolumes([wall], [opening()], [attached({ openingId: 'opening', wallAttachment: { wallId: 'wall', offset: 7, openingHeight: 2 } })])
    expect(result.panels.features).toHaveLength(1)
  })

  it('rotates with actual host endpoints and preserves authoritative height', () => {
    const result = buildDoorAssetVolumes([{ ...wall, start: { x: 5, y: 1 }, end: { x: 5, y: 11 } }], [], [attached({ doorPose: 'ajar' })], 2)
    expect(result.panels.features).toHaveLength(1)
    expect(result.frames.features[0].properties?.height).toBe(4)
    const [a, b] = result.panels.features[0].geometry.coordinates[0]
    expect(Math.atan2(b[1] - a[1], b[0] - a[0])).toBeCloseTo(Math.PI * 2 / 3)
  })

  it('renders a canonical unhosted rectangle using its local centroid and radian rotation', () => {
    const result = buildDoorAssetVolumes([], [], [{ id: 'free', width: 1, geometry: { type: 'rectangle', min: { x: 4, y: 5 }, max: { x: 5, y: 5.2 }, rotation: Math.PI / 2 } }])
    expect(result.panels.features).toHaveLength(1)
    expect(result.frames.features[0].properties).toMatchObject({ doorId: 'free', base: 0, height: 2.1 })
    expect(result.frames.features[0].properties).not.toHaveProperty('wallId')
  })

  it('reports unresolved attached hosts without falling back to free geometry or another wall', () => {
    const result = buildDoorAssetVolumes([wall], [], [attached({ wallAttachment: { wallId: 'missing', offset: 2, openingHeight: 2 }, position: { x: 2, y: 0 }, rotation: 0, depth: 0.2 })])
    expect(all(result)).toHaveLength(0)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ entityId: 'door', code: 'DOOR_HOST_MISSING' }))
  })

  it('keeps distinct free doors and defaults doorType opening to a frame without a panel', () => {
    const free = { id: 'first', width: 1, depth: 0.2, position: { x: 1, y: 2 }, rotation: 0 }
    const result = buildDoorAssetVolumes([], [], [free, { ...free, id: 'second', position: { x: 5, y: 2 }, doorType: 'opening' }])
    expect(result.frames.features).toHaveLength(6)
    expect(result.panels.features).toHaveLength(1)
  })

  it('keeps explicit archways open even if imported appearance asks for a leaf', () => {
    const result = buildDoorAssetVolumes([wall], [opening({ doorAppearance: 'glass' })], [attached({ doorType: 'opening', doorAppearance: 'solid' })])
    expect(result.frames.features).toHaveLength(3)
    expect(result.panels.features).toHaveLength(0)
    expect(result.glass.features).toHaveLength(0)
  })

  it('lets explicit canonical door style win over a duplicate opening without mutating either record', () => {
    const sourceOpening = opening({ doorAppearance: 'solid' })
    const sourceDoor = attached({ doorAppearance: 'glass' })
    const before = JSON.stringify([sourceOpening, sourceDoor])
    const result = buildDoorAssetVolumes([wall], [sourceOpening], [sourceDoor])
    expect(result.panels.features).toHaveLength(0)
    expect(result.glass.features).toHaveLength(1)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ entityId: 'door', code: 'DOOR_APPEARANCE_CONFLICT' }))
    expect(JSON.stringify([sourceOpening, sourceDoor])).toBe(before)
  })

  it('retains explicit opening style when canonical door style is absent', () => {
    const result = buildDoorAssetVolumes([wall], [opening({ doorAppearance: 'glass' })], [attached()])
    expect(result.glass.features).toHaveLength(1)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('does not invent orientation for position-only doors and rejects malformed or out of host spans', () => {
    const result = buildDoorAssetVolumes([wall], [opening({ offset: 9.5 }), opening({ id: 'nan', width: NaN })], [{ id: 'point', width: 1, position: { x: 2, y: 2 } }])
    expect(all(result)).toHaveLength(0)
    expect(result.diagnostics).toHaveLength(3)
  })

  it('keeps tiny positive assets finite, noncollapsed and below the aperture top', () => {
    const result = buildDoorAssetVolumes([wall], [opening({ width: 0.001, height: 0.0001, doorAppearance: 'glass' })], [], 1)
    expect(result.glass.features).toHaveLength(1)
    for (const feature of all(result)) {
      expect(feature.properties?.height).toBeGreaterThan(feature.properties?.base)
      expect(feature.properties?.height).toBeLessThanOrEqual(1.0001)
      expect(feature.geometry.coordinates.flat(2).every(Number.isFinite)).toBe(true)
      const [a, b, c] = feature.geometry.coordinates[0]
      expect(Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))).toBeGreaterThan(0)
    }
  })

  it('rejects nonfinite base and precision-collapsed assets', () => {
    expect(all(buildDoorAssetVolumes([wall], [opening()], [], Infinity))).toHaveLength(0)
    expect(all(buildDoorAssetVolumes([wall], [opening()], [], 1e30))).toHaveLength(0)
    expect(all(buildDoorAssetVolumes([{ ...wall, start: { x: 1e30, y: 0 }, end: { x: 1e30, y: 10 } }], [opening()], []))).toHaveLength(0)
  })
})

describe('door poses and double leaves', () => {
  it('defaults double door type to closed double-solid while explicit style overrides', () => {
    const result = buildDoorAssetVolumes([wall], [], [attached({ doorType: 'double' })])
    expect(result.panels.features).toHaveLength(2)
    expect(result.panels.features[0].geometry.coordinates[0][0][1]).toBeCloseTo(result.panels.features[0].geometry.coordinates[0][1][1])
    expect(buildDoorAssetVolumes([wall], [], [attached({ doorType: 'double', doorAppearance: 'glass' })]).glass.features).toHaveLength(1)
  })
  it('defaults closed inside frame without writing pose or appearance', () => {
    const inputs = [opening(), attached()] as const
    const before = JSON.stringify(inputs)
    const result = buildDoorAssetVolumes([wall], [inputs[0]], [inputs[1]])
    const [a, b] = result.panels.features[0].geometry.coordinates[0]
    expect(b[1] - a[1]).toBeCloseTo(0)
    expect(b[0] - a[0]).toBeCloseTo(0.89)
    for (const [x, y] of result.panels.features[0].geometry.coordinates[0]) {
      expect(x).toBeGreaterThanOrEqual(2.055)
      expect(x).toBeLessThanOrEqual(2.945)
      expect(Math.abs(y)).toBeLessThanOrEqual(0.0175)
    }
    expect(JSON.stringify(inputs)).toBe(before)
    for (const input of inputs) {
      expect(input).not.toHaveProperty('doorPose')
      expect(input).not.toHaveProperty('doorAppearance')
    }
  })

  it.each(['solid', 'glass', 'double-solid', 'double-glass'] as const)('renders %s at each pose with fixed jambs and mirrored right leaves', doorAppearance => {
    const double = doorAppearance.startsWith('double-')
    let frames: unknown, ids: unknown
    for (const [doorPose, angle] of [['closed', 0], ['ajar', Math.PI / 6], ['open', Math.PI / 2]] as const) {
      const result = buildDoorAssetVolumes([wall], [opening({ doorAppearance, doorPose })], [])
      const leaves = doorAppearance.endsWith('glass') ? result.glass.features : result.panels.features
      expect(result.diagnostics).toEqual([])
      expect(leaves).toHaveLength(double ? 2 : 1)
      expect(result.panels.features).toHaveLength(doorAppearance.endsWith('glass') ? 0 : double ? 2 : 1)
      if (frames) expect(result.frames.features.slice(0, 3)).toEqual(frames)
      frames = result.frames.features.slice(0, 3)
      if (ids) expect(leaves.map(leaf => leaf.id)).toEqual(ids)
      ids = leaves.map(leaf => leaf.id)
      const [a, b] = leaves[0].geometry.coordinates[0]
      expect(Math.atan2(b[1] - a[1], b[0] - a[0])).toBeCloseTo(angle)
      if (double) {
        for (const [x, y] of leaves[0].geometry.coordinates[0]) {
          expect(leaves[1].geometry.coordinates[0].some(([rx, ry]) => Math.abs(rx - (5 - x)) < 1e-10 && Math.abs(ry - y) < 1e-10)).toBe(true)
        }
      }
      for (const feature of all(result)) {
        expect(feature.properties).toMatchObject({ openingId: 'opening', wallId: 'wall' })
        expect(feature.geometry.coordinates.flat(2).every(Number.isFinite)).toBe(true)
      }
    }
  })

  it('canonical explicit pose wins with conflict diagnostic while absent pose preserves opening pose', () => {
    const sourceOpening = opening({ doorPose: 'ajar' })
    const sourceDoor = attached({ doorPose: 'open' })
    const before = JSON.stringify([sourceOpening, sourceDoor])
    const result = buildDoorAssetVolumes([wall], [sourceOpening], [sourceDoor])
    const [a, b] = result.panels.features[0].geometry.coordinates[0]
    expect(Math.atan2(b[1] - a[1], b[0] - a[0])).toBeCloseTo(Math.PI / 2)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ entityId: 'door', code: 'DOOR_POSE_CONFLICT' }))
    const retained = buildDoorAssetVolumes([wall], [sourceOpening], [attached()])
    const [c, d] = retained.panels.features[0].geometry.coordinates[0]
    expect(Math.atan2(d[1] - c[1], d[0] - c[0])).toBeCloseTo(Math.PI / 6)
    expect(retained.diagnostics).toEqual([])
    expect(JSON.stringify([sourceOpening, sourceDoor])).toBe(before)
  })

  it.each(['closed', 'ajar', 'open'] as const)('keeps opening door type panel-free at %s pose', doorPose => {
    const result = buildDoorAssetVolumes([wall], [opening({ doorAppearance: 'double-glass', doorPose })], [attached({ doorType: 'opening', doorAppearance: 'double-solid', doorPose })])
    expect(result.frames.features).toHaveLength(3)
    expect(result.panels.features).toHaveLength(0)
    expect(result.glass.features).toHaveLength(0)
  })

  it.each(['double-solid', 'double-glass'] as const)('keeps tiny %s leaves finite at every pose', doorAppearance => {
    for (const doorPose of ['closed', 'ajar', 'open'] as const) {
      const result = buildDoorAssetVolumes([wall], [opening({ width: 0.001, height: 0.0001, doorAppearance, doorPose })], [], 1)
      expect(result.diagnostics).toEqual([])
      expect(result.panels.features.length + result.glass.features.length).toBe(2)
      for (const feature of all(result)) {
        expect(feature.geometry.coordinates.flat(2).every(Number.isFinite)).toBe(true)
        expect(feature.properties?.height).toBeGreaterThan(feature.properties?.base)
      }
    }
  })
})
