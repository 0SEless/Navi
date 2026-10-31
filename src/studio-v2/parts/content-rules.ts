/**
 * Save v2: NAVI 1.5 content rules and structural validation for one part.
 *
 * The server runs `checkPart` on every part before saving, so forbidden or
 * malformed content (embedded images, panoramas, oversized parts, mismatched
 * ids) never reaches the database. `checkPart` never throws: any input,
 * including non-objects and circular data, yields issues instead.
 */
import { canonicalJson } from './canonical'
import { parsePartKey, type PartKey, type PartKind } from './part-keys'
import type { PartRecord } from './split'

export type PartIssueCode = 'NOT_ALLOWED_IN_1_5' | 'TOO_LARGE' | 'INVALID_PART' | 'UNKNOWN_PART_KIND'

export interface PartIssue {
  key: PartKey
  code: PartIssueCode
  /** JSON-pointer-like location inside the part content ('' = the part as a whole). */
  path: string
  message: string
}

/** Largest allowed canonical-JSON size of one part, in UTF-8 bytes (inclusive). */
export const STUDIO_PART_MAX_BYTES = 2_097_152

/** Floor fields that are local-only or forbidden in NAVI 1.5; none may appear in a saved floor part. */
const FORBIDDEN_FLOOR_FIELDS = ['planImageId', 'floorPlanState', 'planAlignment', 'textureId', 'svgOverlayId'] as const

const FLOOR_ARRAY_FIELDS = [
  'rooms',
  'hallways',
  'staircases',
  'elevators',
  'entrances',
  'connectorStops',
  'parametricComponents',
] as const

const MAP_KINDS: ReadonlySet<PartKind> = new Set(['map/road', 'map/junction', 'map/crossing', 'map/area', 'map/poi'])

/** Anchored, linear-time: only the first characters of a string are ever examined. */
const DATA_URI_PATTERN = /^data:[\w.+-]+\/[\w.+-]+;base64,/

type AnyRecord = Record<string, unknown>

function isObject(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

function pointer(field: string): string {
  return `/${escapeSegment(field)}`
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length
}

/** Every string in `root` that looks like an embedded base64 data URI, with its path. Iterative; acyclic input only. */
function findDataUris(root: unknown): string[] {
  const paths: string[] = []
  interface Frame {
    value: unknown
    parent: Frame | null
    segment: string
  }
  const materialize = (frame: Frame): string => {
    const segments: string[] = []
    for (let current: Frame | null = frame; current && current.parent; current = current.parent) {
      segments.push(escapeSegment(current.segment))
    }
    return segments.length === 0 ? '' : `/${segments.reverse().join('/')}`
  }
  const stack: Frame[] = [{ value: root, parent: null, segment: '' }]
  while (stack.length > 0) {
    const frame = stack.pop() as Frame
    const { value } = frame
    if (typeof value === 'string') {
      if (DATA_URI_PATTERN.test(value)) paths.push(materialize(frame))
    } else if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) stack.push({ value: value[i], parent: frame, segment: String(i) })
    } else if (value !== null && typeof value === 'object') {
      const keys = Object.keys(value as AnyRecord)
      for (let i = keys.length - 1; i >= 0; i--) {
        stack.push({ value: (value as AnyRecord)[keys[i]], parent: frame, segment: keys[i] })
      }
    }
  }
  return paths
}

function checkStructure(kind: PartKind, ids: string[], content: unknown, invalid: (path: string, message: string) => void): void {
  if (!isObject(content)) {
    invalid('', `Part content must be an object.`)
    return
  }
  switch (kind) {
    case 'floor': {
      if (typeof content.id !== 'string' || content.id === '') {
        invalid('/id', 'Floor id must be a non-empty string.')
      } else if (content.id !== ids[1]) {
        invalid('/id', `Floor id "${content.id}" does not match the part key floor id "${ids[1]}".`)
      }
      for (const field of FLOOR_ARRAY_FIELDS) {
        if (!Array.isArray(content[field])) invalid(pointer(field), `Floor "${field}" must be an array.`)
      }
      if (!isObject(content.metadata)) invalid('/metadata', 'Floor "metadata" must be an object.')
      return
    }
    case 'building': {
      const building = content.building
      if (!isObject(building)) {
        invalid('/building', 'Building part must hold a "building" object.')
      } else if (typeof building.id !== 'string' || building.id === '') {
        invalid('/building/id', 'Building id must be a non-empty string.')
      } else if (building.id !== ids[0]) {
        invalid('/building/id', `Building id "${building.id}" does not match the part key building id "${ids[0]}".`)
      }
      if (!isStringArray(content.floorOrder)) invalid('/floorOrder', '"floorOrder" must be an array of strings.')
      if (!Array.isArray(content.qrCheckpoints)) invalid('/qrCheckpoints', '"qrCheckpoints" must be an array.')
      if (!isStringArray(content.qrSortKeys)) {
        invalid('/qrSortKeys', '"qrSortKeys" must be an array of strings.')
      } else if (Array.isArray(content.qrCheckpoints) && content.qrSortKeys.length !== content.qrCheckpoints.length) {
        invalid('/qrSortKeys', '"qrSortKeys" must have one entry per QR checkpoint.')
      }
      return
    }
    case 'campus': {
      if (!isStringArray(content.buildingOrder)) invalid('/buildingOrder', '"buildingOrder" must be an array of strings.')
      if (!isStringArray(content.presentCollections)) {
        invalid('/presentCollections', '"presentCollections" must be an array of strings.')
      }
      if (!isObject(content.metadata)) invalid('/metadata', 'Campus "metadata" must be an object.')
      return
    }
    case 'terrain': {
      if (content.terrainAreas !== undefined && !Array.isArray(content.terrainAreas)) {
        invalid('/terrainAreas', '"terrainAreas" must be an array when present.')
      }
      return
    }
    default: {
      if (MAP_KINDS.has(kind)) {
        if (typeof content.id !== 'string' || content.id === '') {
          invalid('/id', 'Map item id must be a non-empty string.')
        } else if (content.id !== ids[0]) {
          invalid('/id', `Item id "${content.id}" does not match the part key id "${ids[0]}".`)
        }
      }
    }
  }
}

export function checkPart(record: PartRecord): PartIssue[] {
  const key = record.key
  const issues: PartIssue[] = []
  const add = (code: PartIssueCode, path: string, message: string) => issues.push({ key, code, path, message })

  let parsed: { kind: PartKind; ids: string[] }
  try {
    parsed = parsePartKey(key)
  } catch (error) {
    add('UNKNOWN_PART_KIND', '', error instanceof Error ? error.message : `Unknown part key "${String(key)}".`)
    return issues
  }

  const content = record.content

  // Size, and the guard that makes the content walk safe (circular or absurdly deep data cannot serialize).
  let serializable = false
  try {
    const json = canonicalJson(content)
    if (json === undefined) {
      add('INVALID_PART', '', 'Part content is not JSON-serializable.')
    } else {
      serializable = true
      const bytes = utf8Length(json)
      if (bytes > STUDIO_PART_MAX_BYTES) {
        add('TOO_LARGE', '', `Part is ${bytes} bytes; the maximum is ${STUDIO_PART_MAX_BYTES}.`)
      }
    }
  } catch {
    add('INVALID_PART', '', 'Part content is not JSON-serializable (circular or too deeply nested).')
  }

  checkStructure(parsed.kind, parsed.ids, content, (path, message) => add('INVALID_PART', path, message))

  if (isObject(content)) {
    if (parsed.kind === 'campus' && Array.isArray(content.panoramas) && content.panoramas.length > 0) {
      add('NOT_ALLOWED_IN_1_5', '/panoramas', 'Panoramas are not allowed in NAVI 1.5.')
    }
    if (parsed.kind === 'floor') {
      for (const field of FORBIDDEN_FLOOR_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(content, field) && content[field] !== undefined) {
          add('NOT_ALLOWED_IN_1_5', pointer(field), `Floor field "${field}" is not allowed in a saved NAVI 1.5 part.`)
        }
      }
    }
  }

  if (serializable) {
    for (const path of findDataUris(content)) {
      add('NOT_ALLOWED_IN_1_5', path, 'Embedded base64 data URIs are not allowed in NAVI 1.5.')
    }
  }

  return issues
}
