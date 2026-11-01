import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isSaveV2PublicReadEnabled, readCurrentPublication } from '@/studio-v2/server/public-read'

/**
 * GET /api/published-map?campus_id=asu-ibajay
 *
 * Public read endpoint that returns compiled NavigationArtifacts from the
 * Supabase `published_maps` table.
 *
 * This is the primary contract for published maps in the NAVI runtime.
 *
 * Save v2 (server env NAVI_SAVE_V2_PUBLIC_READ=1): the same response is built
 * from the campus's current Save v2 publication. `revision` is the published
 * commit (equal to artifacts.metadata.revision, ruling R32), `compilerVersion`
 * is artifacts.metadata.compilerVersion (the value the legacy publish stored in
 * the compiler_version column), and `publishedAt` is the publication time.
 */
async function getFromPublication(campusId: string) {
  try {
    const publication = await readCurrentPublication(campusId)
    if (!publication || !publication.artifacts) {
      return NextResponse.json({ success: false, message: 'No published map found for this campus' }, { status: 404 })
    }
    const metadata = publication.artifacts.metadata as { compilerVersion?: unknown } | null | undefined
    return NextResponse.json({
      success: true,
      campusId,
      revision: publication.sourceCommit,
      compilerVersion: typeof metadata?.compilerVersion === 'string' ? metadata.compilerVersion : null,
      publishedAt: publication.publishedAt,
      artifacts: publication.artifacts,
    })
  } catch {
    console.warn('[published-map] publication read failed')
    return NextResponse.json({ success: false, message: 'Published map is temporarily unavailable' }, { status: 500 })
  }
}

async function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createServerClient(url, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const campusId = searchParams.get('campus_id')

  if (!campusId) {
    return NextResponse.json({ success: false, message: 'campus_id is required' }, { status: 400 })
  }

  if (isSaveV2PublicReadEnabled()) return getFromPublication(campusId)

  try {
    const supabase = await getSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ success: false, message: 'Supabase client unavailable' }, { status: 500 })
    }

    const { data, error } = await supabase
      .from('published_maps')
      .select('campus_id, revision, compiler_version, artifacts, published_at')
      .eq('campus_id', campusId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    if (!data || !data.artifacts) {
      return NextResponse.json({ success: false, message: 'No published map found for this campus' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      campusId: data.campus_id,
      revision: data.revision,
      compilerVersion: data.compiler_version,
      publishedAt: data.published_at,
      artifacts: data.artifacts,
    })
  } catch (err) {
    return NextResponse.json({ success: false, message: (err as Error).message }, { status: 500 })
  }
}
