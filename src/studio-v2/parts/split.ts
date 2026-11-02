/**
 * Save v2: split a CampusDocument into small, independently versioned parts.
 *
 * The split is lossless: `joinParts(splitDocument(doc).parts, localReferences)`
 * reproduces `doc` except for `version`, `_changeJournal`,
 * `metadata.lastModified` and `metadata.editorVersion` (see join.ts).
 *
 * Part shapes (rulings R3–R9):
 * - `campus`: schemaVersion, metadata (minus lastModified/editorVersion),
 *   presentCollections, and when present boundary,
 *   connectivitySemanticsVersion, panoramas, orphanQrCheckpoints/orphanQrSortKeys.
 * - `building:<id>`: { building (without floors), floorOrder, qrCheckpoints, qrSortKeys }.
 * - `floor:<buildingId>:<floorId>`: the Floor minus the local-only fields.
 * - `terrain`: { terrainAreas?, terrainVerticalDatum?, terrain? } (always emitted).
 * - `terrain-tile:<col>_<row>`: one binary part per changed terrain tile (contentBase64, content null).
 * - `map/*:<id>`: the item itself; its original index lives on PartRecord.sortKey.
 *
 * Local-only floor fields (planImageId, planAlignment, floorPlanState) never
 * enter a part; they are returned as LocalFloorReference records.
 */
import type { Building, CampusDocument, Floor, QRCheckpoint } from '@navi/core'
import { canonicalJson, fastHash } from './canonical'
import { partKey, type PartKey, type PartKind } from './part-keys'

export interface PartRecord {
  key: PartKey
  /** null for binary parts (terrain tiles), which carry `contentBase64` instead. */
  content: unknown
  contentBase64?: string
  /** Zero-padded original index within its map collection; null for non-map parts. */
  sortKey: string | null
}

export interface LocalFloorReference {
  buildingId: string
  floorId: string
  planImageId?: string
  planAlignment?: unknown
  floorPlanState?: 'none' | 'active' | 'locked'
}

export interface SplitResult {
  parts: PartRecord[]
  localReferences: LocalFloorReference[]
}

export class UnknownFieldError extends Error {
  readonly path: string
  constructor(path: string) {
    super(`Unknown CampusDocument field "${path}": Save v2 does not know where to store it, so it refuses to save rather than drop it.`)
    this.name = 'UnknownFieldError'
    this.path = path
  }
}

/** Top-level CampusDocument keys the split knows how to place. */
export const KNOWN_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  'schemaVersion',
  'version',
  'metadata',
  'buildings',
  'roads',
  'panoramas',
  'qrCheckpoints',
  'areas',
  'terrainAreas',
  'terrainVerticalDatum',
  'pois',
  'roadJunctions',
  'separatedCrossings',
  'connectivitySemanticsVersion',
  'boundary',
  'terrain',
  'terrainTiles',
  'structures',
  'structurePresets',
  '_changeJournal',
])

export type MapCollectionField = 'roads' | 'roadJunctions' | 'separatedCrossings' | 'areas' | 'pois' | 'structures' | 'structurePresets'

/** Top-level map collections stored one part per item. `roads` is required; the rest are optional. */
export const MAP_COLLECTIONS: ReadonlyArray<{ field: MapCollectionField; kind: PartKind; optional: boolean }> = [
  { field: 'roads', kind: 'map/road', optional: false },
  { field: 'areas', kind: 'map/area', optional: true },
  { field: 'pois', kind: 'map/poi', optional: true },
  { field: 'roadJunctions', kind: 'map/junction', optional: true },
  { field: 'separatedCrossings', kind: 'map/crossing', optional: true },
  { field: 'structures', kind: 'map/structure', optional: true },
  { field: 'structurePresets', kind: 'map/structure-preset', optional: true },
]

export const LOCAL_ONLY_FLOOR_FIELDS = ['planImageId', 'planAlignment', 'floorPlanState'] as const

const STRIPPED_METADATA_FIELDS = ['lastModified', 'editorVersion'] as const

/** '000042' style: the original index, zero-padded to at least 6 digits. */
export function sortKeyFor(index: number): string {
  return String(index).padStart(6, '0')
}

/** Numeric order of zero-padded sort keys (longer = larger, so indexes past 999999 still sort). */
export function compareSortKeys(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length
  return a < b ? -1 : a > b ? 1 : 0
}

type AnyRecord = Record<string, unknown>

/** A key is present when it exists with a value other than undefined (JSON drops undefined). */
function has(source: AnyRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined
}

function requireId(value: unknown, what: string): string {
  const id = (value as AnyRecord | null | undefined)?.id
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error(`Save v2 split: ${what} has a missing or blank id.`)
  }
  return id
}

function requireArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Save v2 split: ${what} must be an array.`)
  return value
}

/**
 * Deep copy of JSON-like data (plain objects, arrays, primitives), keeping key
 * order and undefined-valued keys. About 2-3x faster than structuredClone on a
 * 3 MB campus, which keeps split+partHashes inside its 200 ms budget. Anything
 * that is not a plain object or array falls back to structuredClone.
 */
export function clonePlain<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    const out = new Array(value.length)
    for (let i = 0; i < value.length; i++) out[i] = clonePlain(value[i])
    return out as T
  }
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return structuredClone(value)
  const source = value as AnyRecord
  const out: AnyRecord = {}
  for (const key of Object.keys(source)) {
    if (key === '__proto__') {
      // A JSON-parsed own "__proto__" key must stay data, never become a prototype.
      Object.defineProperty(out, key, { value: clonePlain(source[key]), enumerable: true, writable: true, configurable: true })
    } else {
      out[key] = clonePlain(source[key])
    }
  }
  return out as T
}

export function splitDocument(doc: CampusDocument): SplitResult {
  const source = doc as unknown as AnyRecord
  for (const key of Object.keys(source)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key) && source[key] !== undefined) throw new UnknownFieldError(key)
  }

  // One deep clone of everything that will be stored (never the change journal),
  // so part contents never alias the caller's document and the input is untouched.
  const stored: AnyRecord = {}
  for (const key of Object.keys(source)) {
    if (key === 'version' || key === '_changeJournal') continue
    if (source[key] !== undefined) stored[key] = source[key]
  }
  const data = clonePlain(stored)

  const parts: PartRecord[] = []
  const localReferences: LocalFloorReference[] = []

  // ── Buildings, floors and their QR checkpoints ─────────────────────────────
  const buildings = has(data, 'buildings') ? (requireArray(data.buildings, 'buildings') as Building[]) : []
  const qrByBuilding = new Map<string, { qrCheckpoints: QRCheckpoint[]; qrSortKeys: string[] }>()

  for (let b = 0; b < buildings.length; b++) {
    const building = buildings[b] as unknown as AnyRecord
    const buildingId = requireId(building, `buildings[${b}]`)
    if (qrByBuilding.has(buildingId)) throw new Error(`Save v2 split: duplicate building id "${buildingId}".`)
    // Filled below once every building id is known; the part holds these same arrays.
    const qrBucket = { qrCheckpoints: [] as QRCheckpoint[], qrSortKeys: [] as string[] }
    qrByBuilding.set(buildingId, qrBucket)

    const floors = requireArray(building.floors, `building "${buildingId}" floors`) as Floor[]
    const floorOrder: string[] = []
    const floorIds = new Set<string>()
    for (let f = 0; f < floors.length; f++) {
      const floor = floors[f] as unknown as AnyRecord
      const floorId = requireId(floor, `building "${buildingId}" floors[${f}]`)
      if (floorIds.has(floorId)) throw new Error(`Save v2 split: duplicate floor id "${floorId}" in building "${buildingId}".`)
      floorIds.add(floorId)
      floorOrder.push(floorId)

      let local: LocalFloorReference | null = null
      for (const field of LOCAL_ONLY_FLOOR_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(floor, field)) continue
        if (floor[field] !== undefined) {
          local ??= { buildingId, floorId }
          ;(local as unknown as AnyRecord)[field] = floor[field]
        }
        delete floor[field] // `floor` is our private clone
      }
      if (local) localReferences.push(local)
      parts.push({ key: partKey('floor', buildingId, floorId), content: floor, sortKey: null })
    }

    delete building.floors // private clone
    parts.push({ key: partKey('building', buildingId), content: { building, floorOrder, qrCheckpoints: qrBucket.qrCheckpoints, qrSortKeys: qrBucket.qrSortKeys }, sortKey: sortKeyFor(b) })
  }

  const orphanQrCheckpoints: QRCheckpoint[] = []
  const orphanQrSortKeys: string[] = []
  const qrCheckpoints = has(data, 'qrCheckpoints') ? (requireArray(data.qrCheckpoints, 'qrCheckpoints') as QRCheckpoint[]) : []
  for (let q = 0; q < qrCheckpoints.length; q++) {
    const qr = qrCheckpoints[q]
    const bucket = typeof qr?.buildingId === 'string' ? qrByBuilding.get(qr.buildingId) : undefined
    if (bucket) {
      bucket.qrCheckpoints.push(qr)
      bucket.qrSortKeys.push(sortKeyFor(q))
    } else {
      orphanQrCheckpoints.push(qr)
      orphanQrSortKeys.push(sortKeyFor(q))
    }
  }

  // ── Campus part ────────────────────────────────────────────────────────────
  const presentCollections = MAP_COLLECTIONS.filter((c) => c.optional && has(data, c.field)).map((c) => c.field as string)
  const campus: AnyRecord = {}
  if (has(data, 'schemaVersion')) campus.schemaVersion = data.schemaVersion
  if (has(data, 'metadata')) {
    const metadata = data.metadata as AnyRecord
    for (const field of STRIPPED_METADATA_FIELDS) delete metadata[field] // private clone
    campus.metadata = metadata
  }
  campus.presentCollections = presentCollections
  if (has(data, 'boundary')) campus.boundary = data.boundary
  if (has(data, 'connectivitySemanticsVersion')) campus.connectivitySemanticsVersion = data.connectivitySemanticsVersion
  if (has(data, 'panoramas')) campus.panoramas = data.panoramas
  if (orphanQrCheckpoints.length > 0) {
    campus.orphanQrCheckpoints = orphanQrCheckpoints
    campus.orphanQrSortKeys = orphanQrSortKeys
  }
  parts.unshift({ key: partKey('campus'), content: campus, sortKey: null })

  // ── Terrain part (always emitted) ──────────────────────────────────────────
  const terrain: AnyRecord = {}
  if (has(data, 'terrainAreas')) terrain.terrainAreas = data.terrainAreas
  if (has(data, 'terrainVerticalDatum')) terrain.terrainVerticalDatum = data.terrainVerticalDatum
  if (has(data, 'terrain')) terrain.terrain = data.terrain
  parts.push({ key: partKey('terrain'), content: terrain, sortKey: null })

  // ── Terrain change tiles (binary) ──────────────────────────────────────────
  if (has(data, 'terrainTiles')) {
    const tiles = data.terrainTiles
    if (typeof tiles !== 'object' || tiles === null || Array.isArray(tiles)) throw new Error('Save v2 split: terrainTiles must be an object.')
    for (const [tileId, base64] of Object.entries(tiles as AnyRecord)) {
      if (typeof base64 !== 'string') throw new Error(`Save v2 split: terrain tile "${tileId}" must be a base64 string.`)
      parts.push({ key: partKey('terrain-tile', tileId), content: null, contentBase64: base64, sortKey: null })
    }
  }

  // ── Map items ──────────────────────────────────────────────────────────────
  for (const { field, kind } of MAP_COLLECTIONS) {
    // An absent optional collection is recorded by its absence from presentCollections;
    // an absent `roads` (required) is re-emitted as [] by join.
    if (!has(data, field)) continue
    const items = requireArray(data[field], field)
    const ids = new Set<string>()
    for (let i = 0; i < items.length; i++) {
      const id = requireId(items[i], `${field}[${i}]`)
      if (ids.has(id)) throw new Error(`Save v2 split: duplicate id "${id}" in ${field}.`)
      ids.add(id)
      parts.push({ key: partKey(kind, id), content: items[i], sortKey: sortKeyFor(i) })
    }
  }

  return { parts, localReferences }
}

/** Content hash per part: fastHash(canonicalJson(content)). sortKey is not hashed. */
export function partHashes(parts: PartRecord[]): Map<PartKey, string> {
  const hashes = new Map<PartKey, string>()
  for (const part of parts) hashes.set(part.key, fastHash(canonicalJson(part.content)))
  return hashes
}
