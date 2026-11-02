import { describe, expect, it } from 'vitest'
import type { Building, CampusDocument, TerrainBaseSource } from '@navi/core'
import { toLatLng } from '@navi/core'
import { buildingSetGroundHandler, buildingsFollowGroundHandler } from '../building-ground-handlers'
import type { Command, CommandHandler } from '../types'

const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })

function plane(): TerrainBaseSource {
  const v = (x: number, y: number): [number, number, number] => {
    const p = ll(x, y)
    return [p.lat, p.lng, 0.5 * x]
  }
  return { kind: 'mesh', vertices: [v(-200, -200), v(200, -200), v(200, 200), v(-200, 200)], triangles: [[0, 1, 2], [0, 2, 3]], sourceNote: 'test' }
}

function building(id: string, x0: number, extra: Partial<Building> = {}): Building {
  const ring = [ll(x0, 0), ll(x0 + 20, 0), ll(x0 + 20, 10), ll(x0, 10), ll(x0, 0)]
  return { id, name: id, code: id, category: 'academic', description: '', footprint: { points: ring }, baseElevation: 7, height: 10, floors: [], verticalConnectors: [], color: '#000', aliases: [], metadata: {}, ...extra } as unknown as Building
}

function doc(): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: { campusId: 'c1' }, roads: [], panoramas: [], qrCheckpoints: [],
    buildings: [building('b1', 0), building('b2', 40, { ground: { baseMode: 'fixed', pad: { mode: 'off', blendMeters: 3 } } })],
    terrain: { reference: { name: 'T', zeroMeaning: 'z' }, grid, base: plane(), colorRange: { minM: 0, maxM: 40 } },
  } as unknown as CampusDocument
}

const HANDLERS: Record<string, CommandHandler> = { [buildingSetGroundHandler.id]: buildingSetGroundHandler, [buildingsFollowGroundHandler.id]: buildingsFollowGroundHandler }
function run(d: CampusDocument, command: Command): Command | null {
  const handler = HANDLERS[command.id]
  const result = handler.execute(d, command.payload)
  if (!result.success) throw new Error(result.error)
  return handler.inverse?.(command.payload, result) ?? null
}

describe('building ground commands', () => {
  it('follow-ground base equals the mean under the outline', async () => {
    const { createTerrainSampler, effectiveBuildingBase } = await import('@navi/core')
    const d = doc()
    run(d, { id: 'building.set-ground', label: 'Follow ground', payload: { buildingId: 'b1', baseMode: 'follow-ground' } })
    expect(d.buildings[0].ground).toEqual({ baseMode: 'follow-ground', pad: { mode: 'both', blendMeters: 3 } })
    expect(effectiveBuildingBase(d.buildings[0], createTerrainSampler(d)!)).toBeCloseTo(5, 6)
  })

  it('set-ground fixed keeps the typed base', () => {
    const d = doc()
    run(d, { id: 'building.set-ground', label: 'Fixed height', payload: { buildingId: 'b1', baseMode: 'fixed', baseElevation: 12.5, pad: { mode: 'raise', blendMeters: 5 } } })
    expect(d.buildings[0].baseElevation).toBe(12.5)
    expect(d.buildings[0].ground).toEqual({ baseMode: 'fixed', pad: { mode: 'raise', blendMeters: 5 } })
  })

  it('set-ground undo restores the previous ground and base', () => {
    const d = doc()
    const undo = run(d, { id: 'building.set-ground', label: 'Fixed height', payload: { buildingId: 'b1', baseMode: 'fixed', baseElevation: 3 } })!
    run(d, undo)
    expect(d.buildings[0].baseElevation).toBe(7)
    expect('ground' in d.buildings[0]).toBe(false)
  })

  it('import offer sets follow-ground on all non-fixed buildings in one undo step', () => {
    const d = doc()
    const undo = run(d, { id: 'buildings.follow-ground', label: 'Follow the ground', payload: {} })!
    expect(d.buildings[0].ground?.baseMode).toBe('follow-ground')
    expect(d.buildings[1].ground?.baseMode).toBe('fixed')
    run(d, undo)
    expect('ground' in d.buildings[0]).toBe(false)
  })

  it('unknown building fails', () => {
    expect(buildingSetGroundHandler.execute(doc(), { buildingId: 'nope', baseMode: 'fixed' }).success).toBe(false)
  })
})
