import { describe, expect, it } from 'vitest'
import { decodeTile, encodeTile, toLatLng, TILE_CELLS, type CampusDocument, type TerrainGrid } from '@navi/core'
import { contoursSetupPayload, lassoCommand, resetCommand, slopeCommand } from '../area-commands'

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const square = [ll(10, 10), ll(20, 10), ll(20, 20), ll(10, 20)]

function doc(tiles?: Record<string, string>): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: {}, buildings: [], roads: [], panoramas: [], qrCheckpoints: [],
    boundary: { points: [ll(0, 0), ll(100, 0), ll(100, 100), ll(0, 100)] },
    terrain: { reference: { name: 'T', zeroMeaning: 'z' }, grid, colorRange: { minM: 0, maxM: 40 } },
    ...(tiles ? { terrainTiles: tiles } : {}),
  } as unknown as CampusDocument
}

const cellOf = (tiles: Record<string, string | null>, x: number, y: number) => decodeTile(tiles['0_0']!)[y * TILE_CELLS + x]

describe('area commands', () => {
  it('lasso gives one apply-tiles command', () => {
    const command = lassoCommand(doc(), square, { kind: 'set', meters: 2.5 })!
    expect(command.id).toBe('terrain.apply-tiles')
    expect(cellOf(command.payload.tiles as Record<string, string>, 15, 15)).toBe(250)
  })

  it('slope sets a ramp between two picked heights', () => {
    const command = slopeCommand(doc(), { ...ll(10, 50), h: 1 }, { ...ll(30, 50), h: 3 }, 2)!
    const tiles = command.payload.tiles as Record<string, string>
    expect(cellOf(tiles, 20, 50)).toBe(200)
  })

  it('reset removes changes and drops an emptied tile', () => {
    const cells = new Int16Array(TILE_CELLS * TILE_CELLS)
    cells[15 * TILE_CELLS + 15] = 400
    const command = resetCommand(doc({ '0_0': encodeTile(cells) }), square)!
    expect(command.payload.tiles).toEqual({ '0_0': null })
  })

  it('nothing changed → no command', () => {
    expect(resetCommand(doc(), square)).toBeNull()
  })

  it('contour lines become a contours base with a matching colour range', () => {
    const payload = contoursSetupPayload(doc(), [
      { elevationM: 5, points: [ll(0, 0), ll(50, 0)] },
      { elevationM: 15, points: [ll(0, 40), ll(50, 40)] },
    ])
    expect(payload.base).toMatchObject({ kind: 'contours', lines: [{ elevationM: 5 }, { elevationM: 15 }] })
    expect(payload.colorRange).toEqual({ minM: 5, maxM: 15 })
    expect(payload.reference).toEqual({ name: 'T', zeroMeaning: 'z' })
  })
})
