// @vitest-environment node
// Public read routes under NAVI_SAVE_V2_PUBLIC_READ=1 must answer exactly as the legacy
// routes do for the same published artifacts. Each case runs the route twice on the same
// blob: flag off with a fake Supabase client serving it from published_maps, and flag on
// with a fake Save v2 repository serving it as the current publication.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }))

import { createServerClient } from '@supabase/ssr'
import { CampusCompiler } from '@navi/compiler'
import type { CampusDocument } from '@navi/core'
import { fixtureFull, fixtureMinimal } from '../__fixtures__/campus-fixtures'
import { GET as publicCampusGET } from '../../app/api/public-campus/route'
import { GET as publishedMapGET } from '../../app/api/published-map/route'
import { GET as publicQrGET } from '../../app/api/public-qr/route'
import { GET as campusesGET } from '../../app/api/campuses/route'
import { buildArtifactsBlob, type PublishArtifactsPayload } from './artifacts-blob'
import { setPublicReadRepoForTests, type PublicReadRepo } from './public-read'
import type { PublicationRow } from './types'

const mockCreateServerClient = createServerClient as unknown as ReturnType<typeof vi.fn>

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

// Compiled once: both sides of every comparison read the very same blob.
const FULL_ID = 'asu-ibajay'
const MIN_ID = 'minimal-campus'
const FULL_BLOB = buildArtifactsBlob(compileRouteArtifacts(fixtureFull()), FULL_ID, 7, 7)
const MIN_BLOB = buildArtifactsBlob(compileRouteArtifacts(fixtureMinimal()), MIN_ID, 3, 3)
const PUBLISHED_AT = '2026-11-01T05:00:00.123+00:00'
const QR_ID = 'qr-1'

interface CampusSeed {
  id: string
  name: string
  description: string
  address: string
  blob: Record<string, unknown>
  commitNo: number
  publicationNo: number
}

const SEEDS: CampusSeed[] = [
  { id: FULL_ID, name: 'ASU Ibajay', description: 'Main campus', address: 'Ibajay, Aklan', blob: FULL_BLOB, commitNo: 7, publicationNo: 2 },
  { id: MIN_ID, name: 'Minimal Campus', description: '', address: '', blob: MIN_BLOB, commitNo: 3, publicationNo: 1 },
]

const countOf = (blob: Record<string, unknown>, path: 'buildings' | 'nodes') =>
  path === 'buildings'
    ? ((blob.buildingIndex as { buildings: unknown[] }).buildings.length)
    : ((blob.graph as { nodes: unknown[] }).nodes.length)

// ── Flag off: a fake Supabase client with the legacy tables ──

function legacySupabase(seeds: CampusSeed[]) {
  const tables: string[] = []
  const publishedRow = (seed: CampusSeed) => ({
    campus_id: seed.id,
    revision: seed.commitNo,
    compiler_version: (seed.blob.metadata as { compilerVersion: string }).compilerVersion,
    artifacts: seed.blob,
    published_at: PUBLISHED_AT,
  })
  const snapshotRow = (seed: CampusSeed) => ({
    campus_id: seed.id,
    // The legacy catalog version and timestamp, seeded to what Save v2 derives (see public-read.ts).
    version: String(seed.publicationNo),
    updated_at: PUBLISHED_AT,
    data: { campusId: seed.id, name: seed.name, description: seed.description, address: seed.address },
  })
  const client = {
    from: vi.fn((table: string) => {
      tables.push(table)
      let campusId: string | null = null
      const rows = () => (campusId === null ? seeds : seeds.filter((seed) => seed.id === campusId))
      const builder: Record<string, unknown> = {}
      let countMode = false
      builder.select = (_columns: string, options?: { count?: string }) => {
        countMode = options?.count === 'exact'
        if (table === 'published_maps' && !countMode) {
          // public-qr awaits select() directly; the others chain .eq().maybeSingle().
          const thenable = Object.assign(Promise.resolve({ data: seeds.map(publishedRow), error: null }), builder)
          return thenable
        }
        return builder
      }
      builder.eq = (_column: string, value: string) => {
        campusId = value
        if (countMode) {
          const seed = seeds.find((s) => s.id === value)
          const count = !seed ? 0 : table === 'buildings' ? countOf(seed.blob, 'buildings') : countOf(seed.blob, 'nodes')
          return Promise.resolve({ count, error: null })
        }
        return builder
      }
      builder.order = async () => ({ data: [...seeds].sort((a, b) => (a.id < b.id ? -1 : 1)).map(snapshotRow), error: null })
      builder.maybeSingle = async () => {
        const found = rows()[0]
        if (!found) return { data: null, error: null }
        if (table === 'published_maps') return { data: publishedRow(found), error: null }
        if (table === 'graph_snapshots') return { data: snapshotRow(found), error: null }
        return { data: null, error: null }
      }
      return builder
    }),
  }
  mockCreateServerClient.mockReturnValue(client)
  return { client, tables }
}

// ── Flag on: a fake Save v2 repository ──

function fakeRepo(seeds: CampusSeed[]): PublicReadRepo & { currentPublication: ReturnType<typeof vi.fn>; publishedCampuses: ReturnType<typeof vi.fn> } {
  const publicationOf = (seed: CampusSeed): PublicationRow => ({
    publicationNo: seed.publicationNo,
    sourceCommit: seed.commitNo,
    artifacts: seed.blob,
    publishedAt: PUBLISHED_AT,
    campusName: seed.name,
    campusSettings: { description: seed.description, address: seed.address },
  })
  return {
    currentPublication: vi.fn(async (campusId: string) => {
      const seed = seeds.find((s) => s.id === campusId)
      return seed ? { status: 'ok' as const, publication: publicationOf(seed) } : { status: 'campus_not_found' as const }
    }),
    // studio.published_campuses orders by name; the route must restore the legacy id order.
    publishedCampuses: vi.fn(async () => ({
      status: 'ok' as const,
      campuses: [...seeds]
        .sort((a, b) => (a.name < b.name ? -1 : 1))
        .map((seed) => ({
          id: seed.id,
          name: seed.name,
          settings: { description: seed.description, address: seed.address },
          publicationNo: seed.publicationNo,
          publishedAt: PUBLISHED_AT,
        })),
    })),
  }
}

async function snapshot(response: Response) {
  return { status: response.status, body: await response.json() }
}

type Route = (request: NextRequest) => Promise<Response>

async function bothWays(route: Route, url: string, seeds: CampusSeed[] = SEEDS) {
  delete process.env.NAVI_SAVE_V2_PUBLIC_READ
  legacySupabase(seeds)
  const legacy = await snapshot(await route(new NextRequest(url)))

  process.env.NAVI_SAVE_V2_PUBLIC_READ = '1'
  mockCreateServerClient.mockReset()
  const repo = fakeRepo(seeds)
  setPublicReadRepoForTests(repo)
  const v2 = await snapshot(await route(new NextRequest(url)))
  expect(mockCreateServerClient).not.toHaveBeenCalled()
  return { legacy, v2, repo }
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
  mockCreateServerClient.mockReset()
})

afterEach(() => {
  delete process.env.NAVI_SAVE_V2_PUBLIC_READ
  setPublicReadRepoForTests(null)
})

describe('NAVI_SAVE_V2_PUBLIC_READ=1 responses deep-equal the legacy responses for the same published artifacts', () => {
  it('public-campus', async () => {
    const { legacy, v2, repo } = await bothWays(publicCampusGET, `http://localhost/api/public-campus?campus_id=${FULL_ID}`)
    expect(legacy.status).toBe(200)
    expect(legacy.body.source).toBe('published_maps')
    expect(legacy.body.buildings.length).toBeGreaterThan(0)
    expect(v2).toEqual(legacy)
    expect(repo.currentPublication).toHaveBeenCalledWith(FULL_ID)
  })

  it('published-map', async () => {
    const { legacy, v2 } = await bothWays(publishedMapGET, `http://localhost/api/published-map?campus_id=${FULL_ID}`)
    expect(legacy.status).toBe(200)
    expect(legacy.body).toMatchObject({ success: true, campusId: FULL_ID, revision: 7, publishedAt: PUBLISHED_AT })
    expect(v2).toEqual(legacy)
  })

  it('public-qr (resolved)', async () => {
    const { legacy, v2 } = await bothWays(publicQrGET, `http://localhost/api/public-qr?checkpoint_id=${QR_ID}`)
    expect(legacy.status).toBe(200)
    expect(legacy.body).toMatchObject({ status: 'resolved', campusId: FULL_ID, checkpoint: { id: QR_ID } })
    expect(v2).toEqual(legacy)
  })

  it('public-qr (unknown checkpoint)', async () => {
    const { legacy, v2 } = await bothWays(publicQrGET, 'http://localhost/api/public-qr?checkpoint_id=NOPE-1')
    expect(legacy.status).toBe(404)
    expect(v2).toEqual(legacy)
  })

  it('public-qr (malformed checkpoint) answers before any read', async () => {
    const { legacy, v2, repo } = await bothWays(publicQrGET, 'http://localhost/api/public-qr?checkpoint_id=%20')
    expect(legacy.status).toBe(400)
    expect(v2).toEqual(legacy)
    expect(repo.publishedCampuses).not.toHaveBeenCalled()
  })

  it('campuses list', async () => {
    const { legacy, v2 } = await bothWays(campusesGET, 'http://localhost/api/campuses')
    expect(legacy.status).toBe(200)
    expect(legacy.body.map((c: { id: string }) => c.id)).toEqual([FULL_ID, MIN_ID])
    expect(legacy.body[0].building_count).toBeGreaterThan(0)
    expect(v2).toEqual(legacy)
  })

  it('campuses single campus', async () => {
    const { legacy, v2 } = await bothWays(campusesGET, `http://localhost/api/campuses?campus_id=${FULL_ID}`)
    expect(legacy.status).toBe(200)
    expect(legacy.body.node_count).toBeGreaterThan(0)
    expect(v2).toEqual(legacy)
  })

  it.each([
    ['public-campus', publicCampusGET, '/api/public-campus?campus_id=nowhere'],
    ['published-map', publishedMapGET, '/api/published-map?campus_id=nowhere'],
    ['campuses single', campusesGET, '/api/campuses?campus_id=nowhere'],
  ])('%s for a campus that does not exist', async (_name, route, path) => {
    const { legacy, v2 } = await bothWays(route as Route, `http://localhost${path}`, [])
    expect(v2).toEqual(legacy)
  })

  it('campuses list with nothing published is an empty array', async () => {
    const { legacy, v2 } = await bothWays(campusesGET, 'http://localhost/api/campuses', [])
    expect(legacy.body).toEqual([])
    expect(v2).toEqual(legacy)
  })
})

describe('flag on and nothing published', () => {
  beforeEach(() => {
    process.env.NAVI_SAVE_V2_PUBLIC_READ = '1'
  })

  const unpublished = (status: 'ok' | 'campus_not_found'): PublicReadRepo => ({
    currentPublication: vi.fn(async () => (status === 'ok' ? { status: 'ok' as const, publication: null } : { status: 'campus_not_found' as const })),
    publishedCampuses: vi.fn(async () => ({ status: 'ok' as const, campuses: [] })),
  })

  it.each(['ok', 'campus_not_found'] as const)(
    'public-campus returns the empty (not published) response and never reads graph_snapshots (%s)',
    async (status) => {
      const legacyClient = legacySupabase(SEEDS)
      setPublicReadRepoForTests(unpublished(status))
      const response = await publicCampusGET(new NextRequest('http://localhost/api/public-campus?campus_id=asu-ibajay'))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        campusId: 'asu-ibajay', campusName: null, source: 'empty', revision: null,
        buildings: [], components: [], nodes: [], edges: [], boundary: null,
      })
      expect(mockCreateServerClient).not.toHaveBeenCalled()
      expect(legacyClient.tables).not.toContain('graph_snapshots')
      expect(legacyClient.tables).toEqual([])
    },
  )

  it('published-map returns 404 and never reads Supabase', async () => {
    setPublicReadRepoForTests(unpublished('ok'))
    const response = await publishedMapGET(new NextRequest('http://localhost/api/published-map?campus_id=asu-ibajay'))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ success: false, message: 'No published map found for this campus' })
    expect(mockCreateServerClient).not.toHaveBeenCalled()
  })

  it('campuses single returns 404 and never reads graph_snapshots', async () => {
    setPublicReadRepoForTests(unpublished('ok'))
    const response = await campusesGET(new NextRequest('http://localhost/api/campuses?campus_id=asu-ibajay'))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Campus not found' })
    expect(mockCreateServerClient).not.toHaveBeenCalled()
  })

  it('public-qr returns unknown and never reads Supabase', async () => {
    setPublicReadRepoForTests(unpublished('ok'))
    const response = await publicQrGET(new NextRequest(`http://localhost/api/public-qr?checkpoint_id=${QR_ID}`))
    expect(response.status).toBe(404)
    expect(mockCreateServerClient).not.toHaveBeenCalled()
  })
})

describe('flag on and the Save v2 database fails', () => {
  beforeEach(() => {
    process.env.NAVI_SAVE_V2_PUBLIC_READ = '1'
    const failing = async () => {
      throw new Error('NAVI_STUDIO_DATABASE_URL is not set.')
    }
    setPublicReadRepoForTests({ currentPublication: vi.fn(failing), publishedCampuses: vi.fn(failing) })
  })

  it('public-campus answers 503 PUBLIC_CAMPUS_READ_FAILED (no draft fallback)', async () => {
    const response = await publicCampusGET(new NextRequest('http://localhost/api/public-campus?campus_id=asu-ibajay'))
    expect(response.status).toBe(503)
    expect((await response.json()).error).toBe('PUBLIC_CAMPUS_READ_FAILED')
    expect(mockCreateServerClient).not.toHaveBeenCalled()
  })

  it('public-qr answers 503 unavailable', async () => {
    const response = await publicQrGET(new NextRequest(`http://localhost/api/public-qr?checkpoint_id=${QR_ID}`))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'unavailable', code: 'PUBLIC_QR_READ_FAILED' })
  })

  it('published-map and campuses answer 500 without leaking the error', async () => {
    for (const [route, path] of [
      [publishedMapGET, '/api/published-map?campus_id=asu-ibajay'],
      [campusesGET, '/api/campuses'],
      [campusesGET, '/api/campuses?campus_id=asu-ibajay'],
    ] as const) {
      const response = await route(new NextRequest(`http://localhost${path}`))
      expect(response.status).toBe(500)
      expect(JSON.stringify(await response.json())).not.toContain('NAVI_STUDIO_DATABASE_URL')
    }
  })
})

describe('flag value', () => {
  it('only the exact value "1" turns it on (read at request time)', async () => {
    const repo = fakeRepo(SEEDS)
    setPublicReadRepoForTests(repo)
    for (const value of ['true', '0', ' 1', '']) {
      process.env.NAVI_SAVE_V2_PUBLIC_READ = value
      legacySupabase(SEEDS)
      await publishedMapGET(new NextRequest(`http://localhost/api/published-map?campus_id=${FULL_ID}`))
    }
    expect(repo.currentPublication).not.toHaveBeenCalled()
    process.env.NAVI_SAVE_V2_PUBLIC_READ = '1'
    await publishedMapGET(new NextRequest(`http://localhost/api/published-map?campus_id=${FULL_ID}`))
    expect(repo.currentPublication).toHaveBeenCalledTimes(1)
  })
})
