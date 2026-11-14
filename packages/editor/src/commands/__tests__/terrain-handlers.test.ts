import { describe, expect, it } from 'vitest'
import type { CampusDocument, TerrainBaseSource } from '@navi/core'
import { toLocal } from '@navi/core'
import { terrainApplyTilesHandler, terrainRestoreHandler, terrainSetupHandler } from '../terrain-handlers'
import type { Command, CommandHandler } from '../types'

const boundary = [{ lat: 11.816, lng: 122.169 }, { lat: 11.8195, lng: 122.1735 }, { lat: 11.817, lng: 122.172 }]
const reference = { name: 'Sea level', zeroMeaning: 'Mean sea level' }
const base: TerrainBaseSource = { kind: 'contours', lines: [{ elevationM: 5, points: boundary }], sourceNote: 'test' }

function doc(withBoundary = true): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: { campusId: 'c1' }, buildings: [], roads: [], panoramas: [], qrCheckpoints: [],
    ...(withBoundary ? { boundary: { points: boundary } } : {}),
  } as unknown as CampusDocument
}

const HANDLERS: Record<string, CommandHandler> = {
  [terrainSetupHandler.id]: terrainSetupHandler,
  [terrainApplyTilesHandler.id]: terrainApplyTilesHandler,
  [terrainRestoreHandler.id]: terrainRestoreHandler,
}

/** Runs a command and returns its inverse (what undo would run). */
function run(document: CampusDocument, command: Command): Command | null {
  const handler = HANDLERS[command.id]
  const result = handler.execute(document, command.payload)
  if (!result.success) throw new Error(result.error)
  return handler.inverse?.(command.payload, result) ?? null
}

describe('terrain commands', () => {
  it('setup without boundary fails with the message', () => {
    const result = terrainSetupHandler.execute(doc(false), { reference })
    expect(result).toMatchObject({ success: false, error: 'Draw the campus boundary first' })
  })

  it('setup creates grid at boundary south-west minus 20 m', () => {
    const d = doc()
    run(d, { id: 'terrain.setup', label: 'Set up terrain', payload: { reference, base } })
    expect(d.terrain!.reference).toEqual(reference)
    expect(d.terrain!.base).toEqual(base)
    const corner = toLocal(d.terrain!.grid, { lat: 11.816, lng: 122.169 })
    expect(corner.x).toBeCloseTo(20, 2)
    expect(corner.y).toBeCloseTo(20, 2)
  })

  it('second setup keeps the grid', () => {
    const d = doc()
    run(d, { id: 'terrain.setup', label: 'Set up terrain', payload: { reference } })
    const grid = { ...d.terrain!.grid }
    d.boundary = { points: boundary.map((p) => ({ lat: p.lat - 0.01, lng: p.lng - 0.01 })) }
    run(d, { id: 'terrain.setup', label: 'Set up terrain', payload: { reference: { name: 'Gate road', zeroMeaning: 'Main gate' }, colorRange: { minM: 0, maxM: 30 } } })
    expect(d.terrain!.grid).toEqual(grid)
    expect(d.terrain!.reference.name).toBe('Gate road')
    expect(d.terrain!.colorRange).toEqual({ minM: 0, maxM: 30 })
  })

  it('first setup undo removes terrain again', () => {
    const d = doc()
    const undo = run(d, { id: 'terrain.setup', label: 'Set up terrain', payload: { reference } })!
    run(d, undo)
    expect('terrain' in d).toBe(false)
  })

  it('apply-tiles inverse restores previous tiles and absence', () => {
    const d = doc()
    run(d, { id: 'terrain.setup', label: 'Set up terrain', payload: { reference } })
    const undo = run(d, { id: 'terrain.apply-tiles', label: 'Raise', payload: { tiles: { '0_0': 'AAAA', '-1_0': 'BBBB' } } })!
    expect(d.terrainTiles).toEqual({ '0_0': 'AAAA', '-1_0': 'BBBB' })
    const undo2 = run(d, { id: 'terrain.apply-tiles', label: 'Lower', payload: { tiles: { '0_0': 'CCCC', '-1_0': null } } })!
    expect(d.terrainTiles).toEqual({ '0_0': 'CCCC' })
    run(d, undo2)
    expect(d.terrainTiles).toEqual({ '0_0': 'AAAA', '-1_0': 'BBBB' })
    run(d, undo)
    expect('terrainTiles' in d).toBe(false)
  })

  it('re-import with Clear removes all tiles in one undo step', () => {
    const d = doc()
    run(d, { id: 'terrain.setup', label: 'Set up terrain', payload: { reference } })
    run(d, { id: 'terrain.apply-tiles', label: 'Raise', payload: { tiles: { '0_0': 'AAAA' } } })
    const undo = run(d, { id: 'terrain.setup', label: 'Import ground', payload: { reference, base, clearTiles: true } })!
    expect('terrainTiles' in d).toBe(false)
    expect(d.terrain!.base).toEqual(base)
    run(d, undo)
    expect(d.terrainTiles).toEqual({ '0_0': 'AAAA' })
    expect(d.terrain!.base).toBeUndefined()
  })

  it('re-import with Keep leaves tiles', () => {
    const d = doc()
    run(d, { id: 'terrain.setup', label: 'Set up terrain', payload: { reference } })
    run(d, { id: 'terrain.apply-tiles', label: 'Raise', payload: { tiles: { '0_0': 'AAAA' } } })
    run(d, { id: 'terrain.setup', label: 'Import ground', payload: { reference, base } })
    expect(d.terrainTiles).toEqual({ '0_0': 'AAAA' })
  })
})

describe('boundary and terrain', () => {
  it('shrinking the boundary keeps tiles', async () => {
    const { boundarySetHandler } = await import('../boundary-handlers')
    const d = doc()
    run(d, { id: 'terrain.setup', label: 'Set up terrain', payload: { reference } })
    run(d, { id: 'terrain.apply-tiles', label: 'Raise', payload: { tiles: { '0_0': 'AAAA', '5_5': 'BBBB' } } })
    boundarySetHandler.execute(d, { points: boundary.slice(0, 3).map((p) => ({ lat: p.lat + 0.0001, lng: p.lng })) })
    expect(d.terrainTiles).toEqual({ '0_0': 'AAAA', '5_5': 'BBBB' })
  })
})

describe('terrain.set-look (map look on NAVI Web)', () => {
  it('sets the owner\'s map look, undo puts back the previous look, and an unknown look is refused', async () => {
    const { terrainSetLookHandler } = await import('../terrain-handlers')
    const d = doc()
    terrainSetupHandler.execute(d, { reference, base })
    const result = terrainSetLookHandler.execute(d, { look: 'vivid' })
    expect(result.success).toBe(true)
    expect(d.terrain!.mapLook).toBe('vivid')
    const undo = terrainSetLookHandler.inverse!({ look: 'vivid' }, result)!
    expect(terrainRestoreHandler.execute(d, undo.payload).success).toBe(true)
    expect(d.terrain).not.toHaveProperty('mapLook')
    expect(terrainSetLookHandler.execute(d, { look: 'purple' }).success).toBe(false)
  })

  it('needs a terrain, and terrain.setup keeps an existing map look', async () => {
    const { terrainSetLookHandler } = await import('../terrain-handlers')
    expect(terrainSetLookHandler.execute(doc(), { look: 'sand' }).success).toBe(false)
    const d = doc()
    terrainSetupHandler.execute(d, { reference, base })
    terrainSetLookHandler.execute(d, { look: 'sand' })
    terrainSetupHandler.execute(d, { reference: { name: 'Other', zeroMeaning: 'Gate' } })
    expect(d.terrain!.mapLook).toBe('sand')
  })
})
