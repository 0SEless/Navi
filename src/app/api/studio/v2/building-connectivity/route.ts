import { NextRequest, NextResponse } from 'next/server'
import type { CampusDocument } from '@navi/core'
import { requireVerifiedMutationAuth } from '@/lib/api-guard'
import { validateBuildingConnectivity } from '@/studio-v2/server/building-connectivity'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const unauthorized = await requireVerifiedMutationAuth(request)
  if (unauthorized) return unauthorized
  const body = await request.json().catch(() => null) as {
    document?: CampusDocument; buildingId?: unknown; roadId?: unknown
  } | null
  const document = body?.document
  const buildingId = body?.buildingId
  const roadId = body?.roadId
  if (!document?.metadata || !Array.isArray(document.buildings) || !Array.isArray(document.roads)
    || typeof buildingId !== 'string' || (roadId !== undefined && typeof roadId !== 'string')) {
    return NextResponse.json({ error: 'The draft and building are required.' }, { status: 400 })
  }
  if (!document.buildings.some(building => building?.id === buildingId)) {
    return NextResponse.json({ error: 'This building is missing from the draft.' }, { status: 404 })
  }
  try {
    const report = validateBuildingConnectivity(document, buildingId, roadId)
    if (!report) return NextResponse.json({ error: 'The draft could not be compiled. Review floor validation and try again.' }, { status: 422 })
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Building validation could not run. Check the draft and try again.' }, { status: 422 })
  }
}
