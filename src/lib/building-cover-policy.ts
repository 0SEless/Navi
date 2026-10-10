export const BUILDING_COVER_MAX_BYTES = 8 * 1024 * 1024

const CONTENT_TYPE_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const EXTENSION_CONTENT_TYPE = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const

export type BuildingCoverExtension = keyof typeof EXTENSION_CONTENT_TYPE

export type BuildingCoverUploadValidation =
  | { ok: true; extension: BuildingCoverExtension }
  | { ok: false; reason: 'invalid_type' | 'invalid_size' }

export interface ParsedBuildingCoverKey {
  campusId: string
  buildingId: string
  assetId: string
  extension: BuildingCoverExtension
  contentType: (typeof EXTENSION_CONTENT_TYPE)[BuildingCoverExtension]
}

/** Validate caller metadata before signing an upload. The byte count is rechecked at completion. */
export function validateBuildingCoverUpload(contentType: unknown, byteSize: unknown): BuildingCoverUploadValidation {
  if (typeof contentType !== 'string' || !(contentType in CONTENT_TYPE_EXTENSION)) {
    return { ok: false, reason: 'invalid_type' }
  }
  if (typeof byteSize !== 'number' || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > BUILDING_COVER_MAX_BYTES) {
    return { ok: false, reason: 'invalid_size' }
  }
  return { ok: true, extension: CONTENT_TYPE_EXTENSION[contentType as keyof typeof CONTENT_TYPE_EXTENSION] }
}

export function buildBuildingCoverKey(input: {
  campusId: string
  buildingId: string
  assetId: string
  contentType: string
}): string {
  if (!SAFE_ID.test(input.campusId) || !SAFE_ID.test(input.buildingId)) throw new TypeError('Invalid building cover owner')
  if (!UUID_V4.test(input.assetId)) throw new TypeError('Invalid building cover asset id')
  const validation = validateBuildingCoverUpload(input.contentType, 1)
  if (!validation.ok) throw new TypeError('Unsupported building cover content type')
  return `building-covers/${input.campusId}/${input.buildingId}/${input.assetId}.${validation.extension}`
}

export function parseBuildingCoverKey(value: unknown): ParsedBuildingCoverKey | null {
  if (typeof value !== 'string') return null
  const parts = value.split('/')
  if (parts.length !== 4 || parts[0] !== 'building-covers') return null
  const [, campusId, buildingId, fileName] = parts
  if (!SAFE_ID.test(campusId) || !SAFE_ID.test(buildingId)) return null

  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/.exec(fileName)
  if (!match) return null
  const assetId = match[1]
  const extension = match[2] as BuildingCoverExtension
  return { campusId, buildingId, assetId, extension, contentType: EXTENSION_CONTENT_TYPE[extension] }
}

export function isBuildingCoverKey(value: unknown): value is string {
  return parseBuildingCoverKey(value) !== null
}

export function isBuildingCoverKeyForOwner(value: unknown, campusId: string, buildingId: string): boolean {
  const parsed = parseBuildingCoverKey(value)
  return parsed !== null && parsed.campusId === campusId && parsed.buildingId === buildingId
}

export function buildBuildingCoverReference(key: string): string {
  if (!isBuildingCoverKey(key)) throw new TypeError('Invalid building cover key')
  return `/api/building-cover?key=${encodeURIComponent(key)}`
}

/** Ensure authored metadata receives the canonical stable URL for that Building only. */
export function isBuildingCoverReferenceForOwner(value: unknown, campusId: string, buildingId: string): boolean {
  if (typeof value !== 'string' || !value.startsWith('/api/building-cover?')) return false
  try {
    const url = new URL(value, 'https://navi.invalid')
    const keys = url.searchParams.getAll('key')
    return url.origin === 'https://navi.invalid'
      && url.pathname === '/api/building-cover'
      && url.hash === ''
      && [...url.searchParams.keys()].length === 1
      && keys.length === 1
      && isBuildingCoverKeyForOwner(keys[0], campusId, buildingId)
      && buildBuildingCoverReference(keys[0]) === value
  } catch {
    return false
  }
}
