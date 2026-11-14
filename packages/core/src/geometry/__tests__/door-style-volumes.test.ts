import { describe, expect, it } from 'vitest'
import { buildDoorAssetVolumes } from '../door-assets'
import type { Wall } from '../../types/entities'

const wall = { id: 'w', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, height: 3, thickness: 0.2 } as Wall
const attached = (extra: Record<string, unknown> = {}) => ({ id: 'd', width: 1, doorType: 'standard', wallAttachment: { wallId: 'w', offset: 3, openingHeight: 2.1 }, ...extra })

describe('door volumes: backward compatibility', () => {
  it('absent new fields produce byte-identical volumes to the pre-change snapshot', () => {
    const cases = {
      standardClosed: buildDoorAssetVolumes([wall], [], [attached()] as never),
      standardAjar: buildDoorAssetVolumes([wall], [], [attached({ doorPose: 'ajar' })] as never),
      standardOpen: buildDoorAssetVolumes([wall], [], [attached({ doorPose: 'open' })] as never),
      double: buildDoorAssetVolumes([wall], [], [attached({ doorType: 'double', doorPose: 'ajar' })] as never),
      glass: buildDoorAssetVolumes([wall], [], [attached({ doorAppearance: 'glass', doorPose: 'ajar' })] as never),
      archway: buildDoorAssetVolumes([wall], [], [attached({ doorType: 'opening' })] as never),
    }
    expect(JSON.stringify(cases)).toMatchSnapshot()
  })
})

type Coll = { features: Array<{ id?: string | number; properties: Record<string, unknown>; geometry: { coordinates: number[][][] } }> }
const pts = (c: Coll, idPart: string) => c.features.filter(f => String(f.id).includes(idPart)).flatMap(f => f.geometry.coordinates[0])
const ys = (p: number[][]) => p.map(q => q[1])
const xs = (p: number[][]) => p.map(q => q[0])

describe('door volumes: hinge, swing, sliding, fire', () => {
  it('hingeSide end puts the ajar leaf pivot at width - breadth', () => {
    const start = pts(buildDoorAssetVolumes([wall], [], [attached({ doorPose: 'ajar' })] as never).panels as Coll, 'leaf')
    const end = pts(buildDoorAssetVolumes([wall], [], [attached({ doorPose: 'ajar', hingeSide: 'end' })] as never).panels as Coll, 'leaf')
    expect(Math.min(...xs(start))).toBeCloseTo(2.5 + 0.055 - 0.0175 * Math.sin(Math.PI / 6), 2)
    expect(Math.max(...xs(end))).toBeCloseTo(3.5 - 0.055 + 0.0175 * Math.sin(Math.PI / 6), 2)
    expect(Math.min(...ys(end))).toBeGreaterThan(-0.05)
  })

  it('swingSide right mirrors the ajar leaf across the wall', () => {
    const left = pts(buildDoorAssetVolumes([wall], [], [attached({ doorPose: 'ajar' })] as never).panels as Coll, 'leaf')
    const right = pts(buildDoorAssetVolumes([wall], [], [attached({ doorPose: 'ajar', swingSide: 'right' })] as never).panels as Coll, 'leaf')
    expect(Math.max(...ys(left))).toBeGreaterThan(0.3)
    expect(Math.min(...ys(right))).toBeLessThan(-0.3)
    expect(Math.max(...ys(right))).toBeLessThan(0.05)
  })

  it('double door ignores hingeSide and swingSide right flips both leaves', () => {
    const base = buildDoorAssetVolumes([wall], [], [attached({ doorType: 'double', doorPose: 'ajar' })] as never)
    const hinged = buildDoorAssetVolumes([wall], [], [attached({ doorType: 'double', doorPose: 'ajar', hingeSide: 'end' })] as never)
    expect(JSON.stringify(hinged)).toBe(JSON.stringify(base))
    const right = buildDoorAssetVolumes([wall], [], [attached({ doorType: 'double', doorPose: 'ajar', swingSide: 'right' })] as never).panels as Coll
    for (const side of ['leaf-left', 'leaf-right']) expect(Math.min(...ys(pts(right, side)))).toBeLessThan(-0.1)
  })

  it('sliding door never rotates; open pose shifts a panel along the wall and stays inside the opening', () => {
    for (const doorPose of ['closed', 'ajar', 'open']) {
      const v = buildDoorAssetVolumes([wall], [], [attached({ doorType: 'sliding', doorPose })] as never)
      const panels = pts(v.panels as Coll, 'slide')
      expect(panels.length).toBeGreaterThan(0)
      expect(Math.max(...ys(panels).map(Math.abs))).toBeLessThan(0.1)
      expect(Math.min(...xs(panels))).toBeGreaterThanOrEqual(2.5 - 1e-9)
      expect(Math.max(...xs(panels))).toBeLessThanOrEqual(3.5 + 1e-9)
    }
    const closed = pts(buildDoorAssetVolumes([wall], [], [attached({ doorType: 'sliding' })] as never).panels as Coll, 'slide-moving')
    const open = pts(buildDoorAssetVolumes([wall], [], [attached({ doorType: 'sliding', doorPose: 'open' })] as never).panels as Coll, 'slide-moving')
    expect(Math.min(...xs(open))).toBeLessThan(Math.min(...xs(closed)) - 0.3)
  })

  it('fire door frame depth is 1.5x standard and features carry fire:true', () => {
    const std = pts(buildDoorAssetVolumes([wall], [], [attached()] as never).frames as Coll, 'frames:left')
    const fire = buildDoorAssetVolumes([wall], [], [attached({ doorType: 'fire' })] as never)
    const firePts = pts(fire.frames as Coll, 'frames:left')
    const span = (p: number[][]) => Math.max(...ys(p)) - Math.min(...ys(p))
    expect(span(firePts)).toBeCloseTo(span(std) * 1.5, 6)
    expect([...(fire.frames as Coll).features, ...(fire.panels as Coll).features].every(f => f.properties.fire === true)).toBe(true)
  })

  it('free legacy door with swingSide right uses its rotation as wall direction', () => {
    const legacy = (extra: Record<string, unknown>) => ({ id: 'free', width: 1, depth: 0.2, doorType: 'standard', position: { x: 3, y: 0 }, rotation: 0, doorPose: 'ajar', ...extra })
    const left = pts(buildDoorAssetVolumes([], [], [legacy({})] as never).panels as Coll, 'leaf')
    const right = pts(buildDoorAssetVolumes([], [], [legacy({ swingSide: 'right' })] as never).panels as Coll, 'leaf')
    expect(Math.max(...ys(left))).toBeGreaterThan(0.3)
    expect(Math.min(...ys(right))).toBeLessThan(-0.3)
  })
})

describe('door volumes: materials, folding, rolling (Task 9)', () => {
  const all = (v: ReturnType<typeof buildDoorAssetVolumes>) => [...v.frames.features, ...v.panels.features, ...v.glass.features]

  it('every door feature carries color from resolveDoorStyle; absent material keeps today\'s colour', () => {
    const plain = buildDoorAssetVolumes([wall], [], [attached()] as never)
    for (const f of all(plain)) expect(f.properties).not.toHaveProperty('color')
    const wood = buildDoorAssetVolumes([wall], [], [attached({ material: 'wood' })] as never)
    for (const f of [...wood.frames.features, ...wood.panels.features]) expect(f.properties!.color).toBe('#8B5E3C')
    const fire = buildDoorAssetVolumes([wall], [], [attached({ assetPreset: 'door.fire.single' })] as never)
    expect(fire.panels.features[0].properties).toMatchObject({ color: '#B91C1C', fire: true })
  })

  it('glass features carry glass colour and opacity', () => {
    const v = buildDoorAssetVolumes([wall], [], [attached({ assetPreset: 'door.glass.single', glass: 'frosted' })] as never)
    expect(v.glass.features.length).toBeGreaterThan(0)
    for (const f of v.glass.features) expect(f.properties).toMatchObject({ color: '#F8FAFC', glassOpacity: 0.55 })
  })

  it('half-glass preset has a solid lower panel and an upper glass pane', () => {
    const v = buildDoorAssetVolumes([wall], [], [attached({ assetPreset: 'door.wood.half-glass' })] as never)
    expect(v.panels.features.some(f => String(f.id).includes('leaf-lower'))).toBe(true)
    const pane = v.glass.features.find(f => String(f.id).includes('pane'))!
    expect(pane.properties!.base).toBeGreaterThan(0.9)
  })

  it('folding: 4 panels in a zigzag; open pose folds to <= 25% of the opening width', () => {
    const closed = buildDoorAssetVolumes([wall], [], [attached({ doorOperation: 'folding' })] as never)
    const folds = closed.panels.features.filter(f => String(f.id).includes('fold'))
    expect(folds).toHaveLength(4)
    for (const f of folds) expect(f.properties!.operation).toBe('folding')
    const open = pts(buildDoorAssetVolumes([wall], [], [attached({ doorOperation: 'folding', doorPose: 'open' })] as never).panels as Coll, 'fold')
    expect(Math.max(...xs(open)) - Math.min(...xs(open))).toBeLessThanOrEqual(0.25 + 0.05)
    const ajar = pts(buildDoorAssetVolumes([wall], [], [attached({ doorOperation: 'folding', doorPose: 'ajar' })] as never).panels as Coll, 'fold')
    expect(Math.max(...ys(ajar))).toBeGreaterThan(0.05)
  })

  it('rolling: closed = full slat panel, ajar = half height plus head box, open = head box only', () => {
    const v = (doorPose: string) => buildDoorAssetVolumes([wall], [], [attached({ doorOperation: 'rolling', doorPose })] as never).panels.features
    const closed = v('closed')
    expect(closed.map(f => String(f.id).split(':').pop())).toEqual(['shutter'])
    expect(closed[0].properties).toMatchObject({ base: 0, operation: 'rolling' })
    const ajar = v('ajar')
    expect(ajar.map(f => String(f.id).split(':').pop()).sort()).toEqual(['head-box', 'shutter'])
    expect(ajar.find(f => String(f.id).endsWith('shutter'))!.properties!.base).toBeGreaterThan(0.9)
    expect(v('open').map(f => String(f.id).split(':').pop())).toEqual(['head-box'])
  })
})
