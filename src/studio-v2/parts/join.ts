/**
 * Save v2: rebuild a CampusDocument from the parts produced by splitDocument.
 *
 * - `version` is always 0 (the caller owns versioning) and `_changeJournal` is
 *   never recreated.
 * - `metadata.lastModified` / `metadata.editorVersion` come from `opts`,
 *   defaulting to '1970-01-01T00:00:00.000Z' and ''.
 * - Buildings follow their parts' sortKey (R42), floors follow each building's
 *   floorOrder, QR checkpoints and map items follow their sort keys.
 * - Optional map collections are recreated when listed in
 *   campus.presentCollections (even if empty) and omitted otherwise.
 * - Local-only floor fields are restored from `local` when given.
 *
 * The result never aliases the input parts or local references.
 */
import type { CampusDocument } from '@navi/core'
import { parsePartKey, partKey, type PartKey, type PartKind } from './part-keys'
import {
  LOCAL_ONLY_FLOOR_FIELDS,
  MAP_COLLECTIONS,
  clonePlain,
  compareSortKeys,
  type LocalFloorReference,
  type PartRecord,
} from './split'

export interface JoinOptions {
  lastModified?: string
  editorVersion?: string
}

export const DEFAULT_LAST_MODIFIED = '1970-01-01T00:00:00.000Z'
export const DEFAULT_EDITOR_VERSION = ''

type AnyRecord = Record<string, unknown>

function fail(message: string): never {
  throw new Error(`Save v2 join: ${message}`)
}

function has(source: AnyRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined
}

function asRecord(value: unknown, what: string): AnyRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${what} must be an object.`)
  return value as AnyRecord
}

function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) fail(`${what} must be an array.`)
  return value
}

function asStringArray(value: unknown, what: string): string[] {
  const array = asArray(value, what)
  if (!array.every((entry) => typeof entry === 'string')) fail(`${what} must contain only strings.`)
  return array as string[]
}

interface Sorted<T> {
  sortKey: string | null
  key: string
  value: T
}

function bySortKeyThenKey<T>(a: Sorted<T>, b: Sorted<T>): number {
  if (a.sortKey !== b.sortKey) {
    if (a.sortKey === null) return 1
    if (b.sortKey === null) return -1
    const order = compareSortKeys(a.sortKey, b.sortKey)
    if (order !== 0) return order
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

export function joinParts(parts: PartRecord[], local?: LocalFloorReference[], opts?: JoinOptions): CampusDocument {
  // Clone up front so nothing in the result aliases the caller's parts.
  const byKey = new Map<PartKey, PartRecord>()
  const mapItems = new Map<PartKind, Array<Sorted<unknown>>>()
  for (const part of parts) {
    if (byKey.has(part.key)) fail(`duplicate part key "${part.key}".`)
    const { kind, ids } = parsePartKey(part.key)
    const record: PartRecord = { key: part.key, content: clonePlain(part.content), sortKey: part.sortKey }
    byKey.set(part.key, record)
    if (kind.startsWith('map/')) {
      const item = asRecord(record.content, `part "${part.key}"`)
      if (item.id !== ids[0]) fail(`part "${part.key}" holds an item with id "${String(item.id)}".`)
      const bucket = mapItems.get(kind) ?? []
      bucket.push({ sortKey: part.sortKey, key: part.key, value: item })
      mapItems.set(kind, bucket)
    } else if (kind === 'terrain-tile') {
      fail(`part kind "terrain-tile" is not produced by splitDocument ("${part.key}").`)
    }
  }
  const consumed = new Set<PartKey>()
  const take = (key: PartKey, what: string): unknown => {
    const part = byKey.get(key)
    if (!part) fail(`missing ${what} part "${key}".`)
    consumed.add(key)
    return part.content
  }

  // ── Campus ─────────────────────────────────────────────────────────────────
  const campus = asRecord(take(partKey('campus'), 'campus'), 'campus part')
  const presentCollections = new Set(asStringArray(campus.presentCollections ?? [], 'campus.presentCollections'))

  // ── Buildings, floors, QR checkpoints ──────────────────────────────────────
  const qrs: Array<Sorted<unknown>> = []
  const buildings: AnyRecord[] = []
  const floorIndex = new Map<string, AnyRecord>()
  // R42: building order travels on each building part's sortKey (not in the campus part),
  // so adding a building never touches the strictly-locked campus zone.
  const buildingParts: Array<Sorted<string>> = []
  for (const part of byKey.values()) {
    const parsed = parsePartKey(part.key)
    if (parsed.kind === 'building') buildingParts.push({ sortKey: part.sortKey, key: part.key, value: parsed.ids[0] })
  }
  buildingParts.sort(bySortKeyThenKey)
  for (const { value: buildingId } of buildingParts) {
    const key = partKey('building', buildingId)
    const content = asRecord(take(key, 'building'), `part "${key}"`)
    const building = asRecord(content.building, `part "${key}".building`)
    if (building.id !== buildingId) fail(`part "${key}" holds a building with id "${String(building.id)}".`)
    const floorOrder = asStringArray(content.floorOrder, `part "${key}".floorOrder`)
    const floors: AnyRecord[] = []
    const seenFloors = new Set<string>()
    for (const floorId of floorOrder) {
      if (seenFloors.has(floorId)) fail(`part "${key}".floorOrder lists "${floorId}" twice.`)
      seenFloors.add(floorId)
      const floorKey = partKey('floor', buildingId, floorId)
      const floor = asRecord(take(floorKey, 'floor'), `part "${floorKey}"`)
      if (floor.id !== floorId) fail(`part "${floorKey}" holds a floor with id "${String(floor.id)}".`)
      floors.push(floor)
      floorIndex.set(floorKey, floor)
    }
    buildings.push({ ...building, floors })

    const qrCheckpoints = asArray(content.qrCheckpoints ?? [], `part "${key}".qrCheckpoints`)
    const qrSortKeys = asStringArray(content.qrSortKeys ?? [], `part "${key}".qrSortKeys`)
    if (qrCheckpoints.length !== qrSortKeys.length) fail(`part "${key}" has ${qrCheckpoints.length} QR checkpoints but ${qrSortKeys.length} sort keys.`)
    qrCheckpoints.forEach((qr, i) => qrs.push({ sortKey: qrSortKeys[i], key, value: qr }))
  }

  const orphanQrs = asArray(campus.orphanQrCheckpoints ?? [], 'campus.orphanQrCheckpoints')
  const orphanSortKeys = asStringArray(campus.orphanQrSortKeys ?? [], 'campus.orphanQrSortKeys')
  if (orphanQrs.length !== orphanSortKeys.length) fail(`campus has ${orphanQrs.length} orphan QR checkpoints but ${orphanSortKeys.length} sort keys.`)
  orphanQrs.forEach((qr, i) => qrs.push({ sortKey: orphanSortKeys[i], key: 'campus', value: qr }))
  // Array.prototype.sort is stable, so equal sort keys keep their part order.
  qrs.sort((a, b) => compareSortKeys(a.sortKey!, b.sortKey!))

  // ── Terrain ────────────────────────────────────────────────────────────────
  const terrainKey = partKey('terrain')
  const terrain = byKey.has(terrainKey) ? asRecord(take(terrainKey, 'terrain'), 'terrain part') : {}

  for (const items of mapItems.values()) {
    for (const item of items) consumed.add(item.key)
    items.sort(bySortKeyThenKey)
  }
  const unreferenced = [...byKey.keys()].filter((key) => !consumed.has(key))
  if (unreferenced.length > 0) fail(`parts not referenced by the campus/building order: ${unreferenced.join(', ')}.`)

  // ── Assemble (stable key order mirroring CampusDocument) ───────────────────
  const metadata: AnyRecord = {
    ...(campus.metadata ? asRecord(campus.metadata, 'campus.metadata') : {}),
    lastModified: opts?.lastModified ?? DEFAULT_LAST_MODIFIED,
    editorVersion: opts?.editorVersion ?? DEFAULT_EDITOR_VERSION,
  }
  const collection = (field: string): unknown[] | undefined => {
    const spec = MAP_COLLECTIONS.find((c) => c.field === field)!
    const items = mapItems.get(spec.kind)?.map((item) => item.value)
    if (items && items.length > 0) return items
    return !spec.optional || presentCollections.has(field) ? [] : undefined
  }

  const doc: AnyRecord = {}
  if (has(campus, 'schemaVersion')) doc.schemaVersion = campus.schemaVersion
  doc.version = 0
  doc.metadata = metadata
  doc.buildings = buildings
  doc.roads = collection('roads')
  if (has(campus, 'panoramas')) doc.panoramas = campus.panoramas
  doc.qrCheckpoints = qrs.map((qr) => qr.value)
  const optional: Array<[string, unknown]> = [
    ['areas', collection('areas')],
    ['terrainAreas', has(terrain, 'terrainAreas') ? terrain.terrainAreas : undefined],
    ['terrainVerticalDatum', has(terrain, 'terrainVerticalDatum') ? terrain.terrainVerticalDatum : undefined],
    ['pois', collection('pois')],
    ['roadJunctions', collection('roadJunctions')],
    ['separatedCrossings', collection('separatedCrossings')],
    ['connectivitySemanticsVersion', has(campus, 'connectivitySemanticsVersion') ? campus.connectivitySemanticsVersion : undefined],
    ['boundary', has(campus, 'boundary') ? campus.boundary : undefined],
  ]
  for (const [field, value] of optional) if (value !== undefined) doc[field] = value

  // ── Local-only floor fields ────────────────────────────────────────────────
  for (const reference of local ?? []) {
    if (!reference?.buildingId || !reference.floorId) continue
    const floor = floorIndex.get(partKey('floor', reference.buildingId, reference.floorId))
    if (!floor) continue // stale reference to a floor that no longer exists
    for (const field of LOCAL_ONLY_FLOOR_FIELDS) {
      const value = (reference as unknown as AnyRecord)[field]
      if (value !== undefined) floor[field] = clonePlain(value)
    }
  }

  return doc as unknown as CampusDocument
}
