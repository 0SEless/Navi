import type { TerrainGrid, TileId } from './types'

export const CELL_METERS = 1
export const TILE_CELLS = 128
export const GRID_MARGIN_METERS = 20

const METERS_PER_DEG_LAT = 110540
const METERS_PER_DEG_LNG_AT_EQUATOR = 111320
const TILE_BYTES = TILE_CELLS * TILE_CELLS * 2

function metersPerDegLng(grid: TerrainGrid): number {
  return METERS_PER_DEG_LNG_AT_EQUATOR * Math.cos((grid.originLat * Math.PI) / 180)
}

/** Metres east (x) and north (y) of the grid origin. */
export function toLocal(grid: TerrainGrid, p: { lat: number; lng: number }): { x: number; y: number } {
  return { x: (p.lng - grid.originLng) * metersPerDegLng(grid), y: (p.lat - grid.originLat) * METERS_PER_DEG_LAT }
}

export function toLatLng(grid: TerrainGrid, p: { x: number; y: number }): { lat: number; lng: number } {
  return { lat: grid.originLat + p.y / METERS_PER_DEG_LAT, lng: grid.originLng + p.x / metersPerDegLng(grid) }
}

export function tileIdOf(col: number, row: number): TileId {
  return `${col}_${row}`
}

const TILE_ID_PATTERN = /^(-?\d+)_(-?\d+)$/

export function parseTileId(id: string): { col: number; row: number } {
  const match = TILE_ID_PATTERN.exec(id)
  if (!match) throw new Error(`Malformed terrain tile id "${id}".`)
  return { col: Number(match[1]), row: Number(match[2]) }
}

/** The tile holding cell (cx, cy) and the cell's index inside it (row-major, south row first). */
export function tileOfCell(cx: number, cy: number): { col: number; row: number; i: number } {
  const col = Math.floor(cx / TILE_CELLS)
  const row = Math.floor(cy / TILE_CELLS)
  const localX = cx - col * TILE_CELLS
  const localY = cy - row * TILE_CELLS
  return { col, row, i: localY * TILE_CELLS + localX }
}

/** Rounds to whole centimetres and clamps to Int16 (never wraps). */
export function clampCm(value: number): number {
  const rounded = Math.round(value)
  return rounded > 32767 ? 32767 : rounded < -32768 ? -32768 : rounded
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Int16 little-endian values as base64. */
export function encodeInt16(values: Int16Array): string {
  const bytes = new Uint8Array(values.length * 2)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < values.length; i++) view.setInt16(i * 2, values[i], true)
  return bytesToBase64(bytes)
}

export function decodeInt16(base64: string): Int16Array {
  const bytes = base64ToBytes(base64)
  if (bytes.length % 2 !== 0) throw new Error('Int16 data has an odd byte length.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const values = new Int16Array(bytes.length / 2)
  for (let i = 0; i < values.length; i++) values[i] = view.getInt16(i * 2, true)
  return values
}

export function encodeTile(cells: Int16Array): string {
  if (cells.length !== TILE_CELLS * TILE_CELLS) throw new Error(`A terrain tile has ${TILE_CELLS * TILE_CELLS} cells.`)
  return encodeInt16(cells)
}

export function decodeTile(base64: string): Int16Array {
  const bytes = base64ToBytes(base64)
  if (bytes.length !== TILE_BYTES) throw new Error(`A terrain tile is ${TILE_BYTES} bytes, got ${bytes.length}.`)
  return decodeInt16(base64)
}

/** Grid origin GRID_MARGIN_METERS south and west of the boundary's minimum. */
export function gridOriginForBoundary(points: Array<{ lat: number; lng: number }>): TerrainGrid {
  if (points.length === 0) throw new Error('The campus boundary has no points.')
  const minLat = Math.min(...points.map((p) => p.lat))
  const minLng = Math.min(...points.map((p) => p.lng))
  const provisional: TerrainGrid = { originLat: minLat, originLng: minLng }
  const corner = toLatLng(provisional, { x: -GRID_MARGIN_METERS, y: -GRID_MARGIN_METERS })
  return { originLat: corner.lat, originLng: corner.lng }
}
