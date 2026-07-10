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

    // Dynamic import — @navi/compiler uses Node crypto, only safe on server
    const { CampusCompiler } = await import('@navi/compiler')
    const compiler = new CampusCompiler()
    const result = compiler.compile(document)

    return NextResponse.json({
      status: result.success ? 'success' : 'error',
      message: result.success
        ? undefined
        : result.errors[0]?.message ?? 'Compilation failed',
      artifacts: result.success
        ? {
            navigationGraph: result.graph,
            stats: result.stats,
          }
        : undefined,
      timestamp: Date.now(),
    })
  } catch (err: any) {
    return NextResponse.json(
      { status: 'error', message: err?.message ?? 'Internal compilation error', timestamp: Date.now() },
      { status: 500 },
    )
  }
}
