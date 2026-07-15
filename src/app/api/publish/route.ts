import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

const DEMO_DIR = join(process.cwd(), 'demo-output')

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    const { artifacts, campusId, revision } = await request.json()
    if (!artifacts || !artifacts.navigationGraph) {
      return NextResponse.json({ success: false, message: 'Missing artifacts' }, { status: 400 })
    }

    if (!existsSync(DEMO_DIR)) mkdirSync(DEMO_DIR, { recursive: true })

    const files: Record<string, string> = {
      'navigation.graph.json': JSON.stringify(artifacts.navigationGraph, null, 2),
      'search.index.json': JSON.stringify(artifacts.searchIndex ?? null, null, 2),
      'poi.json': JSON.stringify(artifacts.poiData ?? null, null, 2),
      'building-index.json': JSON.stringify(artifacts.buildingIndex ?? null, null, 2),
    }

    for (const [filename, content] of Object.entries(files)) {
      writeFileSync(join(DEMO_DIR, filename), content)
    }

    // Checksums computed from the exact bytes written to disk (see ERRORS.md 2026-07-08).
    const manifest = {
      projectId: campusId ?? 'campus',
      campusId: campusId ?? 'campus',
      publishedAt: new Date().toISOString(),
      schemaVersion: 1,
      compilerVersion: revision != null ? String(revision) : '0.1.0',
      artifacts: {
        navigationGraph: { filename: 'navigation.graph.json', checksum: sha256(files['navigation.graph.json']), size: Buffer.byteLength(files['navigation.graph.json'], 'utf-8') },
        searchIndex: { filename: 'search.index.json', checksum: sha256(files['search.index.json']), size: Buffer.byteLength(files['search.index.json'], 'utf-8') },
        poiData: { filename: 'poi.json', checksum: sha256(files['poi.json']), size: Buffer.byteLength(files['poi.json'], 'utf-8') },
        buildingIndex: { filename: 'building-index.json', checksum: sha256(files['building-index.json']), size: Buffer.byteLength(files['building-index.json'], 'utf-8') },
      },
    }

    writeFileSync(join(DEMO_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

    return NextResponse.json({
      success: true,
      manifest,
      counts: {
        nodes: (artifacts.navigationGraph as any)?.nodes?.length ?? 0,
        edges: (artifacts.navigationGraph as any)?.edges?.length ?? 0,
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, message: (err as Error).message }, { status: 500 })
  }
}
