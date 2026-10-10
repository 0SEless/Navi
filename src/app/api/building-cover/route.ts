import { NextRequest, NextResponse } from 'next/server'
import { BUILDING_COVER_MAX_BYTES, parseBuildingCoverKey } from '@/lib/building-cover-policy'
import { headBuildingCoverObject, presignBuildingCoverGet } from '@/lib/building-cover-r2'
import { readR2Config, sanitizeR2Error } from '@/lib/r2'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const SHORT_REDIRECT_CACHE = 'public, max-age=30, stale-while-revalidate=60'

function invalidKey() {
  return NextResponse.json({ error: 'invalid_request', field: 'key' }, { status: 400 })
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const keys = url.searchParams.getAll('key')
  if (keys.length !== 1 || [...url.searchParams.keys()].length !== 1) return invalidKey()
  const key = keys[0]
  const parsed = parseBuildingCoverKey(key)
  if (!parsed) return invalidKey()

  const settings = readR2Config()
  if (!settings.ok) {
    return NextResponse.json({ error: 'missing_configuration', missing: settings.missing }, { status: 503 })
  }

  try {
    const head = await headBuildingCoverObject(settings.config, key)
    if (
      !head.ok
      || head.contentType !== parsed.contentType
      || !Number.isSafeInteger(head.byteSize)
      || head.byteSize < 1
      || head.byteSize > BUILDING_COVER_MAX_BYTES
    ) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const signedUrl = await presignBuildingCoverGet(settings.config, key)
    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: signedUrl,
        'Cache-Control': SHORT_REDIRECT_CACHE,
        'Content-Type': parsed.contentType,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (error) {
    const safe = sanitizeR2Error(error)
    console.error('building cover public resolve failed:', JSON.stringify(safe))
    return NextResponse.json({ error: 'resolve_failed', code: safe.code }, { status: 502 })
  }
}
