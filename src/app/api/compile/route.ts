import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/compile
 *
 * Server-side compilation endpoint.
 * Receives a CampusDocument and delegates to @navi/compiler (which
 * depends on Node built-ins like `crypto` that are unavailable in
 * browser contexts).
 *
 * Request body: { document: CampusDocument }
 * Response: { status: 'success' | 'error', artifacts?, message?, timestamp }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const document = body.document

    if (!document || !document.buildings || !document.metadata) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid document payload', timestamp: Date.now() },
        { status: 400 },
      )
    }

    // Dynamic import — @navi/compiler uses Node crypto/fs, only safe on server
    const { CampusCompiler, buildSearchIndex, buildPOIData, buildBuildingIndex } = await import('@navi/compiler')
    const compiler = new CampusCompiler()
    const result = compiler.compile(document)

    if (!result.success || !result.graph) {
      return NextResponse.json(
        {
          status: 'error',
          message: result.errors[0]?.message ?? 'Compilation failed',
          timestamp: Date.now(),
        },
        { status: 500 },
      )
    }

    const graph = result.graph
    const searchIndex = buildSearchIndex(document, graph)
    const poiData = buildPOIData(graph)
    const buildingIndex = buildBuildingIndex(document, graph)

    return NextResponse.json({
      status: 'success',
      artifacts: {
        navigationGraph: graph,
        stats: result.stats,
        searchIndex,
        poiData,
        buildingIndex,
      },
      timestamp: Date.now(),
    })
  } catch (err: any) {
    return NextResponse.json(
      { status: 'error', message: err?.message ?? 'Internal compilation error', timestamp: Date.now() },
      { status: 500 },
    )
  }
}
