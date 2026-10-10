import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { assertCampusMutationAllowed } from '@/lib/api-guard'
import { getBuildingCoverAdminIdentity } from '@/lib/building-cover-auth'
import {
  buildBuildingCoverKey,
  buildBuildingCoverReference,
  isBuildingCoverKeyForOwner,
  validateBuildingCoverUpload,
} from '@/lib/building-cover-policy'
import { checkAuthoredBuildingOwnership } from '@/lib/building-cover-repository'
import { headBuildingCoverObject, presignBuildingCoverPut } from '@/lib/building-cover-r2'
import { createBuildingCoverUploadToken, verifyBuildingCoverUploadToken } from '@/lib/building-cover-upload-token'
import { readR2Config, sanitizeR2Error } from '@/lib/r2'

export const runtime = 'nodejs'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidRequest(field: string) {
  return NextResponse.json({ error: 'invalid_request', field }, { status: 400 })
}

function missingConfiguration(missing: string[]) {
  return NextResponse.json({ error: 'missing_configuration', missing }, { status: 503 })
}

async function readBody(request: NextRequest): Promise<JsonRecord | null> {
  try {
    const body: unknown = await request.json()
    return isRecord(body) ? body : null
  } catch {
    return null
  }
}

function validOwnerIds(campusId: unknown, buildingId: unknown): campusId is string {
  return typeof campusId === 'string'
    && typeof buildingId === 'string'
    && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(campusId)
    && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(buildingId)
}

async function authorizeBuilding(request: NextRequest, campusId: string, buildingId: string) {
  // Check the data target before even verifying the session against Supabase.
  // Vercel Preview must not authenticate against Production when misconfigured.
  const target = assertCampusMutationAllowed(campusId)
  if (target) return { response: target } as const

  const identity = await getBuildingCoverAdminIdentity(request, campusId)
  if (!identity.ok) return { response: identity.response } as const

  const ownership = await checkAuthoredBuildingOwnership(campusId, buildingId)
  if (!ownership.ok) {
    return {
      response: NextResponse.json(
        { error: ownership.reason === 'not_found' ? 'building_not_found' : 'authored_document_unavailable' },
        { status: ownership.reason === 'not_found' ? 404 : 503 },
      ),
    } as const
  }
  return { userId: identity.userId } as const
}

export async function POST(request: NextRequest) {
  const body = await readBody(request)
  if (!body) return invalidRequest('body')
  if (body.action !== 'sign' && body.action !== 'complete') return invalidRequest('action')
  if (!validOwnerIds(body.campusId, body.buildingId)) return invalidRequest('campusId')

  const campusId = body.campusId
  const buildingId = body.buildingId as string

  if (body.action === 'sign') {
    const upload = validateBuildingCoverUpload(body.contentType, body.byteSize)
    if (!upload.ok) return invalidRequest(upload.reason === 'invalid_type' ? 'contentType' : 'byteSize')
    let key: string
    try {
      // The immutable object ID is minted server-side; request key/assetId fields are ignored.
      key = buildBuildingCoverKey({ campusId, buildingId, assetId: randomUUID(), contentType: body.contentType as string })
    } catch {
      return invalidRequest('owner')
    }

    const authorization = await authorizeBuilding(request, campusId, buildingId)
    if ('response' in authorization) return authorization.response

    const settings = readR2Config()
    if (!settings.ok) return missingConfiguration(settings.missing)

    const uploadToken = createBuildingCoverUploadToken({
      campusId,
      buildingId,
      key,
      contentType: body.contentType as string,
      byteSize: body.byteSize as number,
      subject: authorization.userId,
    }, settings.config.secretAccessKey)

    try {
      const uploadUrl = await presignBuildingCoverPut(settings.config, key, body.contentType as string)
      return NextResponse.json({
        ok: true,
        uploadUrl,
        uploadToken,
        expiresIn: 600,
        contentType: body.contentType,
        byteSize: body.byteSize,
      })
    } catch (error) {
      const safe = sanitizeR2Error(error)
      console.error('building cover PUT presign failed:', JSON.stringify(safe))
      return NextResponse.json({ error: 'presign_failed', code: safe.code }, { status: 502 })
    }
  }

  if (typeof body.uploadToken !== 'string' || body.uploadToken.length > 4096) return invalidRequest('uploadToken')
  const authorization = await authorizeBuilding(request, campusId, buildingId)
  if ('response' in authorization) return authorization.response

  const settings = readR2Config()
  if (!settings.ok) return missingConfiguration(settings.missing)
  const claims = verifyBuildingCoverUploadToken(body.uploadToken, settings.config.secretAccessKey)
  if (!claims) return NextResponse.json({ error: 'invalid_upload_token' }, { status: 401 })
  if (claims.campusId !== campusId || claims.buildingId !== buildingId || !isBuildingCoverKeyForOwner(claims.key, campusId, buildingId)) {
    return NextResponse.json({ error: 'upload_owner_mismatch' }, { status: 400 })
  }
  if (claims.subject !== authorization.userId) return NextResponse.json({ error: 'upload_subject_mismatch' }, { status: 403 })

  try {
    const head = await headBuildingCoverObject(settings.config, claims.key)
    if (!head.ok || head.contentType !== claims.contentType || head.byteSize !== claims.byteSize) {
      return NextResponse.json({ error: 'upload_verification_failed' }, { status: 409 })
    }
    return NextResponse.json({
      ok: true,
      reference: buildBuildingCoverReference(claims.key),
      contentType: claims.contentType,
      byteSize: claims.byteSize,
    })
  } catch (error) {
    const safe = sanitizeR2Error(error)
    console.error('building cover HEAD verification failed:', JSON.stringify(safe))
    return NextResponse.json({ error: 'upload_verification_failed', code: safe.code }, { status: 502 })
  }
}
