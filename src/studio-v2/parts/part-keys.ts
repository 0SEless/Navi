export type PartKind =
  | 'campus'
  | 'building'
  | 'floor'
  | 'terrain'
  | 'terrain-tile'
  | 'map/road'
  | 'map/junction'
  | 'map/crossing'
  | 'map/area'
  | 'map/poi'

export type PartKey = string
export type ZoneKey = `building:${string}` | 'terrain' | 'campus'

const ARITY: Record<PartKind, number> = {
  campus: 0,
  building: 1,
  floor: 2,
  terrain: 0,
  'terrain-tile': 1,
  'map/road': 1,
  'map/junction': 1,
  'map/crossing': 1,
  'map/area': 1,
  'map/poi': 1,
}

function isPartKind(value: string): value is PartKind {
  return Object.prototype.hasOwnProperty.call(ARITY, value)
}

function assertArity(kind: PartKind, ids: readonly string[]): void {
  if (ids.length !== ARITY[kind]) {
    throw new Error(`Part kind "${kind}" takes ${ARITY[kind]} id(s), got ${ids.length}.`)
  }
  if (ids.some((id) => id === '')) {
    throw new Error(`Part kind "${kind}" does not accept an empty id.`)
  }
}

export function partKey(kind: PartKind, ...ids: string[]): PartKey {
  if (!isPartKind(kind)) throw new Error(`Unknown part kind "${String(kind)}".`)
  assertArity(kind, ids)
  return [kind, ...ids.map(encodeURIComponent)].join(':')
}

export function parsePartKey(key: PartKey): { kind: PartKind; ids: string[] } {
  const separator = key.indexOf(':')
  const kind = separator === -1 ? key : key.slice(0, separator)
  if (!isPartKind(kind)) throw new Error(`Unknown part kind in key "${key}".`)
  const ids = separator === -1 ? [] : key.slice(separator + 1).split(':').map(decodeURIComponent)
  assertArity(kind, ids)
  return { kind, ids }
}

export function zoneOf(key: PartKey): ZoneKey | null {
  const { kind, ids } = parsePartKey(key)
  switch (kind) {
    case 'campus':
      return 'campus'
    case 'building':
    case 'floor':
      return `building:${encodeURIComponent(ids[0])}`
    case 'terrain':
    case 'terrain-tile':
      return 'terrain'
    default:
      return null
  }
}
