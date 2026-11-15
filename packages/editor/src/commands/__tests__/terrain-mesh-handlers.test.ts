import { describe, expect, it } from 'vitest'
import type { CampusDocument, TerrainBaseSource, TerrainMesh } from '@navi/core'
import { createTerrainSampler, levelMesh, newMesh, toLatLng, toLocal } from '@navi/core'
import { terrainRestoreHandler, terrainSetupHandler } from '../terrain-handlers'
import {
  terrainMeshAddHandler, terrainMeshMergeHandler, terrainMeshRemoveHandler, terrainMeshReorderHandler, terrainMeshUpdateHandler,
  terrainSculptingClearHandler, terrainSetViewHandler,
} from '../terrain-mesh-handlers'
import { roadRestoreGradeHandler, roadSetGradeHandler } from '../road-grade-handlers'
import type { Command, CommandHandler } from '../types'

const boundary = [{ lat: 11.816, lng: 122.169 }, { lat: 11.8195, lng: 122.1735 }, { lat: 11.817, lng: 122.172 }]
const reference = { name: 'Sea level', zeroMeaning: 'Mean sea level' }
const base: TerrainBaseSource = { kind: 'contours', lines: [{ elevationM: 5, points: boundary }], sourceNote: 'test' }

const HANDLERS: Record<string, CommandHandler> = Object.fromEntries([
  terrainSetupHandler, terrainRestoreHandler, terrainMeshAddHandler, terrainMeshUpdateHandler, terrainMeshRemoveHandler,
  terrainMeshReorderHandler, terrainMeshMergeHandler, terrainSculptingClearHandler, terrainSetViewHandler, roadSetGradeHandler, roadRestoreGradeHandler,
].map((h) => [h.id, h]))

function run(document: CampusDocument, command: Command): Command | null {
  const handler = HANDLERS[command.id]
  const result = handler.execute(document, command.payload)
  if (!result.success) throw new Error(result.error)
  return handler.inverse?.(command.payload, result) ?? null
}
const refused = (document: CampusDocument, command: Command) => HANDLERS[command.id].execute(document, command.payload).success === false

function setUp(): CampusDocument {
  const d = {
    schemaVersion: 1, version: 0, metadata: { campusId: 'c1' }, buildings: [], panoramas: [], qrCheckpoints: [], boundary: { points: boundary },
    roads: [{ id: 'r1', name: 'Gate road', polyline: { points: [{ lat: 11.817, lng: 122.170 }, { lat: 11.817, lng: 122.1705 }] }, width: 6, surface: 'asphalt', type: 'connector', metadata: {} }],
  } as unknown as CampusDocument
  run(d, { id: 'terrain.setup', label: 'Set up', payload: { reference, base } })
  return d
}
function meshIn(d: CampusDocument, id = 'm1'): TerrainMesh {
  const g = d.terrain!.grid
  const c = toLocal(g, boundary[0])
  const ring = [[10, 10], [40, 10], [40, 40], [10, 40]].map(([x, y]) => toLatLng(g, { x: c.x + x, y: c.y + y }))
  return newMesh(id, 'Front gate slope', ring, g)
}

describe('terrain mesh commands', () => {
  it('add, update, reorder and remove a mesh; every undo puts the document back', () => {
    const d = setUp()
    const start = structuredClone(d)
    const undoAdd = run(d, { id: 'terrain.mesh.add', label: 'Add', payload: { mesh: meshIn(d) } })!
    expect(d.terrain!.meshes).toHaveLength(1)
    run(d, { id: 'terrain.mesh.add', label: 'Add', payload: { mesh: meshIn(d, 'm2') } })
    const before = structuredClone(d)
    const undoUpdate = run(d, { id: 'terrain.mesh.update', label: 'Edit', payload: { mesh: { ...meshIn(d), name: 'Renamed' } } })!
    expect(d.terrain!.meshes![0].name).toBe('Renamed')
    run(d, undoUpdate)
    expect(d.terrain).toEqual(before.terrain)
    const undoReorder = run(d, { id: 'terrain.mesh.reorder', label: 'Move', payload: { meshId: 'm2', toIndex: 0 } })!
    expect(d.terrain!.meshes!.map((m) => m.id)).toEqual(['m2', 'm1'])
    run(d, undoReorder)
    const undoRemove = run(d, { id: 'terrain.mesh.remove', label: 'Delete', payload: { meshId: 'm2' } })!
    expect(d.terrain!.meshes!.map((m) => m.id)).toEqual(['m1'])
    run(d, undoRemove)
    run(d, { id: 'terrain.mesh.remove', label: 'Delete', payload: { meshId: 'm2' } })
    run(d, undoAdd)
    expect(d.terrain).toEqual(start.terrain)
  })

  it('refuses bad payloads', () => {
    const d = setUp()
    expect(refused(d, { id: 'terrain.mesh.add', label: 'Add', payload: { mesh: { ...meshIn(d), z: [1] } } })).toBe(true)
    expect(refused(d, { id: 'terrain.mesh.update', label: 'Edit', payload: { mesh: meshIn(d, 'nope') } })).toBe(true)
    expect(refused(d, { id: 'terrain.mesh.remove', label: 'Delete', payload: { meshId: 'nope' } })).toBe(true)
    run(d, { id: 'terrain.mesh.add', label: 'Add', payload: { mesh: meshIn(d) } })
    expect(refused(d, { id: 'terrain.mesh.add', label: 'Add', payload: { mesh: meshIn(d) } })).toBe(true)
  })

  it('merge bakes the mesh into Sculpting: same ground, mesh gone', () => {
    const d = setUp()
    const mesh = levelMesh(meshIn(d), 9, () => 0, d.terrain!.grid)
    run(d, { id: 'terrain.mesh.add', label: 'Add', payload: { mesh } })
    const s = createTerrainSampler(d)!
    const c = toLocal(d.terrain!.grid, boundary[0])
    const pts = Array.from({ length: 100 }, (_, i) => ({ x: c.x + 15 + (i % 10) * 2, y: c.y + 15 + Math.floor(i / 10) * 2 }))
    const heights = pts.map((p) => s.heightAt(p.x, p.y))
    const undo = run(d, { id: 'terrain.mesh.merge', label: 'Merge', payload: { meshId: 'm1' } })!
    expect(d.terrain!.meshes ?? []).toHaveLength(0)
    const after = createTerrainSampler(d)!
    pts.forEach((p, i) => expect(Math.abs(after.heightAt(p.x, p.y) - heights[i])).toBeLessThan(0.02))
    run(d, undo)
    expect(d.terrain!.meshes).toHaveLength(1)
  })

  it('clear Sculpting and the view flags; setup keeps meshes and flags', () => {
    const d = setUp()
    d.terrainTiles = { '0_0': 'AAAA' }
    const undoClear = run(d, { id: 'terrain.sculpting.clear', label: 'Clear', payload: {} })!
    expect(d.terrainTiles).toBeUndefined()
    run(d, undoClear)
    expect(d.terrainTiles).toEqual({ '0_0': 'AAAA' })
    run(d, { id: 'terrain.mesh.add', label: 'Add', payload: { mesh: meshIn(d) } })
    run(d, { id: 'terrain.set-view', label: 'Hide', payload: { meshId: 'm1', hidden: true } })
    run(d, { id: 'terrain.set-view', label: 'Hide', payload: { sculptingHidden: true } })
    expect(d.terrain!.meshes![0].hidden).toBe(true)
    expect(d.terrain!.sculptingHidden).toBe(true)
    run(d, { id: 'terrain.setup', label: 'Re-import', payload: { reference, base } })
    expect(d.terrain!.meshes).toHaveLength(1)
    expect(d.terrain!.sculptingHidden).toBe(true)
  })
})

describe('road.set-grade', () => {
  it('sets a road\'s grading and undo restores it; bad values are refused', () => {
    const d = setUp()
    const before = structuredClone(d)
    const undo = run(d, { id: 'road.set-grade', label: 'Grade', payload: { roadId: 'r1', groundFit: { mode: 'both', blendMeters: 3 }, grade: { smoothness: 0.5, pins: [{ alongM: 10, heightM: 6 }] } } })!
    expect(d.roads[0].groundFit).toEqual({ mode: 'both', blendMeters: 3 })
    expect(d.roads[0].grade).toEqual({ smoothness: 0.5, pins: [{ alongM: 10, heightM: 6 }] })
    run(d, undo)
    expect(d.roads).toEqual(before.roads)
    expect(refused(d, { id: 'road.set-grade', label: 'Grade', payload: { roadId: 'nope', grade: { smoothness: 0.5 } } })).toBe(true)
    expect(refused(d, { id: 'road.set-grade', label: 'Grade', payload: { roadId: 'r1', grade: { smoothness: 2 } } })).toBe(true)
    expect(refused(d, { id: 'road.set-grade', label: 'Grade', payload: { roadId: 'r1', grade: { smoothness: 0.5, pins: [{ alongM: 9999, heightM: 1 }] } } })).toBe(true)
    run(d, { id: 'road.set-grade', label: 'Grade', payload: { roadId: 'r1', grade: null } })
    expect(d.roads[0]).not.toHaveProperty('grade')
  })
})
