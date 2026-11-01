// @vitest-environment node
// buildArtifactsBlob must produce exactly the blob the legacy publish route writes to
// published_maps. The legacy route is driven end to end (auth, revision parsing,
// validation) with its Supabase writer replaced by a capture, and the captured blob is
// compared byte for byte (key order included) with buildArtifactsBlob on the same input.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const captured: Array<{ revision: number; compiler_version: string; artifacts: unknown }> = []

vi.mock('fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('fs')>()
  return { ...real, existsSync: vi.fn(() => true), mkdirSync: vi.fn(), writeFileSync: vi.fn() }
})
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => {
    // Only the empty-graph pre-check reads through the client: "no current publication".
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.eq = () => builder
    builder.maybeSingle = async () => ({ data: null, error: null })
    return { from: () => builder }
  }),
}))
vi.mock('@/services/published-map-writer', () => ({
  writePublishedMap: vi.fn(async (_client: unknown, row: (typeof captured)[number]) => {
    captured.push(row)
    return { status: 'written' }
  }),
}))

import { CampusCompiler } from '@navi/compiler'
import type { CampusDocument } from '@navi/core'
import { fixtureFull, fixtureMinimal } from '../__fixtures__/campus-fixtures'
import { POST as legacyPublish } from '../../app/api/publish/route'
import { buildArtifactsBlob, resolveCompilerVersion, type PublishArtifactsPayload } from './artifacts-blob'

const SESSION = Buffer.from(JSON.stringify({ id: 'mock-super-admin', role: 'super_admin' })).toString('base64')

/** The artifacts exactly as /api/compile returns them to Studio (JSON over HTTP). */
function compileRouteArtifacts(doc: CampusDocument): PublishArtifactsPayload {
  const result = new CampusCompiler().compileV2(doc)
  const a = result.artifacts
  return JSON.parse(JSON.stringify({
    ...(a ?? {}),
    navigationGraph: result.graph,
    searchIndex: a?.searchIndex ?? null,
    poiData: a?.poiIndex ?? null,
    buildingIndex: a?.buildingIndex ?? null,
    spatialIndex: a?.spatialIndex ?? null,
    panoramaIndex: a?.panoramaIndex ?? null,
    floorGeometry: a?.floorGeometry ?? null,
    qrIndex: a?.qrIndex ?? null,
    components: a?.components ?? [],
    doors: a?.doors ?? [],
    metadata: a?.metadata ?? null,
  }))
}

async function legacyBlob(body: Record<string, unknown>) {
  captured.length = 0
  const response = await legacyPublish(new NextRequest('http://localhost/api/publish', {
    method: 'POST',
    headers: { cookie: `navi-mock-session=${SESSION}` },
    body: JSON.stringify(body),
  }))
  expect(response.status).toBe(200)
  expect(captured).toHaveLength(1)
  return captured[0]
}

describe('buildArtifactsBlob equals the blob the legacy publish route writes', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MOCK_AUTH = 'true'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
  })

  it('compiled fixtureMinimal with an explicit revision (source provenance from the compiler)', async () => {
    const artifacts = compileRouteArtifacts(fixtureMinimal())
    const row = await legacyBlob({ artifacts, campusId: 'minimal-campus', revision: 5 })
    const blob = buildArtifactsBlob(artifacts, 'minimal-campus', 5, 1)
    expect(JSON.stringify(blob)).toBe(JSON.stringify(row.artifacts))
    expect(row.compiler_version).toBe(resolveCompilerVersion(artifacts))
  })

  it('compiled full fixture (terrain, QR, connectivity version) with the revision taken from provenance', async () => {
    const artifacts = compileRouteArtifacts(fixtureFull())
    const row = await legacyBlob({ artifacts, campusId: 'asu-ibajay' })
    expect(row.revision).toBe(42)
    const blob = buildArtifactsBlob(artifacts, 'asu-ibajay', 42, 42)
    expect(JSON.stringify(blob)).toBe(JSON.stringify(row.artifacts))
    expect(Object.keys(blob)).toContain('terrainAreas')
  })

  it('hand-made artifacts: defaults for missing indexes, compiledAt from the graph, extra metadata kept', async () => {
    const artifacts: PublishArtifactsPayload = {
      navigationGraph: { version: '2.1.0', campusId: 'hand-campus', createdAt: '2026-01-01T00:00:00.000Z', nodes: [], edges: [] },
      metadata: { campusId: 'hand-campus', compilerVersion: '2.0.0', revision: 3, sourceDocumentVersion: 3, extra: 'kept' },
    }
    const row = await legacyBlob({ artifacts, campusId: 'hand-campus', revision: '9' })
    const blob = buildArtifactsBlob(artifacts, 'hand-campus', 9, 3)
    expect(JSON.stringify(blob)).toBe(JSON.stringify(row.artifacts))
    expect(blob.metadata).toMatchObject({ revision: '9', sourceDocumentVersion: '3', compiledAt: '2026-01-01T00:00:00.000Z' })
  })

  it('sourceRevision null falls back to revision; compilerVersion falls back to the graph version', () => {
    const blob = buildArtifactsBlob(
      { navigationGraph: { version: '3.0.0', createdAt: 'T', nodes: [], edges: [] } },
      'c1',
      4,
      null,
    )
    expect(blob.metadata).toEqual({
      campusId: 'c1',
      compilerVersion: '3.0.0',
      revision: '4',
      sourceDocumentVersion: '4',
      compiledAt: 'T',
    })
    expect(blob.searchIndex).toEqual({ version: '1.0.0', entries: [] })
    expect(blob.components).toEqual([])
    expect('terrainAreas' in blob).toBe(false)
  })
})
