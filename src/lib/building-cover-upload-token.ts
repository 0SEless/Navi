import { createHmac, timingSafeEqual } from 'node:crypto'
import { isBuildingCoverKeyForOwner, parseBuildingCoverKey, validateBuildingCoverUpload } from './building-cover-policy'

export const BUILDING_COVER_UPLOAD_TTL_SECONDS = 10 * 60

export interface BuildingCoverUploadGrant {
  campusId: string
  buildingId: string
  key: string
  contentType: string
  byteSize: number
  subject: string
}

export interface BuildingCoverUploadClaims extends BuildingCoverUploadGrant {
  expiresAt: number
}

function isSecret(secret: unknown): secret is string {
  return typeof secret === 'string' && secret.length >= 16
}

function isSubject(subject: unknown): subject is string {
  return typeof subject === 'string' && subject.length > 0 && subject.length <= 256 && !/[\u0000-\u001f\u007f]/.test(subject)
}

function hasValidGrant(value: unknown): value is BuildingCoverUploadGrant {
  if (!value || typeof value !== 'object') return false
  const grant = value as Record<string, unknown>
  if (typeof grant.campusId !== 'string' || typeof grant.buildingId !== 'string' || typeof grant.key !== 'string') return false
  if (typeof grant.contentType !== 'string' || typeof grant.byteSize !== 'number' || !isSubject(grant.subject)) return false
  const key = parseBuildingCoverKey(grant.key)
  const upload = validateBuildingCoverUpload(grant.contentType, grant.byteSize)
  return key !== null
    && key.contentType === grant.contentType
    && upload.ok
    && isBuildingCoverKeyForOwner(grant.key, grant.campusId, grant.buildingId)
}

function signature(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest()
}

export function createBuildingCoverUploadToken(grant: BuildingCoverUploadGrant, secret: string, nowMs = Date.now()): string {
  if (!isSecret(secret)) throw new TypeError('Invalid building cover signing secret')
  if (!hasValidGrant(grant)) throw new TypeError('Invalid building cover upload grant')
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new TypeError('Invalid building cover token clock')

  const claims: BuildingCoverUploadClaims = {
    campusId: grant.campusId,
    buildingId: grant.buildingId,
    key: grant.key,
    contentType: grant.contentType,
    byteSize: grant.byteSize,
    subject: grant.subject,
    expiresAt: Math.floor(nowMs / 1000) + BUILDING_COVER_UPLOAD_TTL_SECONDS,
  }
  const encoded = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  const signedData = `bc1.${encoded}`
  return `${signedData}.${signature(signedData, secret).toString('base64url')}`
}

export function verifyBuildingCoverUploadToken(token: unknown, secret: string, nowMs = Date.now()): BuildingCoverUploadClaims | null {
  if (!isSecret(secret) || typeof token !== 'string' || token.length > 4096 || !Number.isSafeInteger(nowMs) || nowMs < 0) return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'bc1') return null
  const [, encoded, suppliedSignature] = parts
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[A-Za-z0-9_-]+$/.test(suppliedSignature)) return null

  let payload: unknown
  let received: Buffer
  try {
    const decoded = Buffer.from(encoded, 'base64url')
    if (decoded.toString('base64url') !== encoded) return null
    received = Buffer.from(suppliedSignature, 'base64url')
    if (received.toString('base64url') !== suppliedSignature || received.length !== 32) return null
    const signedData = `bc1.${encoded}`
    if (!timingSafeEqual(signature(signedData, secret), received)) return null
    payload = JSON.parse(decoded.toString('utf8')) as unknown
  } catch {
    return null
  }

  if (!hasValidGrant(payload)) return null
  const expiresAt = Reflect.get(payload, 'expiresAt')
  if (typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(nowMs / 1000)) return null
  return { ...payload, expiresAt }
}
