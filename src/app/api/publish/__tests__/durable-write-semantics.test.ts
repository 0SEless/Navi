// @vitest-environment node
/**
 * Phase 5C-B: durable publication success/failure contract.
 *
 * Success is defined ONLY by the canonical durable `published_maps` write.
 * A failed durable write must never be reported as success (and must not let
 * demo-output generation manufacture success), and a failed non-authoritative
 * demo write must never be reported as publication failure.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }))
vi.mock('fs', () => ({ existsSync: vi.fn(() => true), mkdirSync: vi.fn(), writeFileSync: vi.fn() }))
vi.mock('@/services/published-map-writer', () => ({ writePublishedMap: vi.fn() }))

import { createServerClient } from '@supabase/ssr'
import { writeFileSync } from 'fs'
import { writePublishedMap } from '@/services/published-map-writer'
import { POST } from '../route'

const MOCK_SESSION = Buffer.from(
  JSON.stringify({ id: 'mock-super-admin', role: 'super_admin' }),
).toString('base64',
)
const CAMPUS = 'durable-campus'
const RAW_DB_ERROR =
  'duplicate key value violates unique constraint "published_maps_pkey"'

function fakeSupabase() {
  const builder = (payload: unknown = null) => {
    const b: Record<string, unknown> = {}
    b.eq = () => b
    b.lt = () => b
    b.select = async () => ({ data: payload ? [payload] : [], error: null })
    b.maybeSingle = async () => ({ data: payload, error: null })
    return b
  }
  ;(createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    from: () => ({
      select: () => builder(null),
      update: () => builder(null),
      insert: () => builder(null),
      upsert: async (payload: Record<string, unknown>) => ({ data: [payload], error: null }),
    }),
  })
}

function artifacts(options: { panoramaIndex?: unknown; revision?: number } = {}) {
  const revision = options.revision ?? 11
  const base: Record<string, unknown> = {
    navigationGraph: {
      version: '1.0.0',
      campusId: CAMPUS,
      createdAt: '2026-10-01T00:00:00.000Z',
      nodes: [],
      edges: [],
    },
    searchIndex: { version: '1.0.0', entries: [] },
    buildingIndex: { version: '1.0.0', buildings: [] },
    components: [],
    doors: [],
    metadata: {
      campusId: CAMPUS,
      compilerVersion: '1.0.0',
      revision: String(revision),
      sourceDocumentVersion: String(revision),
      compiledAt: '2026-10-01T00:00:00.000Z',
    },
  }
  if (options.panoramaIndex) base.panoramaIndex = options.panoramaIndex
  return base
}

function post(body: Record<string, unknown> = {}) {
  return POST(
    new NextRequest('http://localhost/api/publish', {
      method: 'POST',
      headers: { cookie: `navi-mock-session=${MOCK_SESSION}` },
      body: JSON.stringify({
        artifacts: artifacts(),
        campusId: CAMPUS,
        revision: 11,
        ...body,
      }),
    }),
  )
}

const writer = () => vi.mocked(writePublishedMap)
const demoWrites = () => vi.mocked(writeFileSync)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_MOCK_AUTH = 'true'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
  fakeSupabase()
  vi.mocked(writeFileSync).mockImplementation(() => undefined)
})

describe('Phase 5C-B — durable publication contract', () => {
  it('CASE A — durable writer error blocks publication (503) and no demo success is manufactured', async () => {
    writer().mockResolvedValue({ status: 'error', message: RAW_DB_ERROR })

    const res = await post()
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.success).toBe(false)
    // CASE I: raw driver detail must not be client-visible.
    expect(JSON.stringify(body)).not.toContain('published_maps_pkey')
    expect(JSON.stringify(body)).not.toContain('duplicate key')
    // CASE: no misleading "published" demo artifacts after a failed publish.
    expect(demoWrites()).not.toHaveBeenCalled()
  })

  it('CASE B — a thrown writer/transport failure blocks publication (503) without leaking internals', async () => {
    writer().mockRejectedValue(new Error('fetch failed: ECONNRESET'))

    const res = await post()
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.success).toBe(false)
    expect(JSON.stringify(body)).not.toContain('ECONNRESET')
    expect(demoWrites()).not.toHaveBeenCalled()
  })

  it('CASE C — missing canonical Supabase configuration blocks publication (503)', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    const res = await post()
    const body = await res.json()

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'

    expect(res.status).toBe(503)
    expect(body.success).toBe(false)
    expect(writer()).not.toHaveBeenCalled()
    expect(demoWrites()).not.toHaveBeenCalled()
  })

  it('CASE D — durable success returns 200 success:true and writes demo output', async () => {
    writer().mockResolvedValue({ status: 'published' })

    const res = await post()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(demoWrites().mock.calls.length).toBeGreaterThan(0)
  })

  it('CASE E — durable success + demo failure is STILL a successful publication (no 500, no second write)', async () => {
    writer().mockResolvedValue({ status: 'published' })
    vi.mocked(writeFileSync).mockImplementation(() => {
      throw new Error('EACCES: read-only file system')
    })

    const res = await post()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    // Durable write happened exactly once and is never retried or rolled back.
    expect(writer()).toHaveBeenCalledTimes(1)
  })

  it('CASE F — revision conflict remains 409 with its established shape', async () => {
    writer().mockResolvedValue({ status: 'rejected', currentRevision: 12 })

    const res = await post()
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.success).toBe(false)
    expect(body.revision).toBe(11)
    expect(body.currentRevision).toBe(12)
    expect(demoWrites()).not.toHaveBeenCalled()
  })

  it('CASE G — panorama integrity failure still rejects with 422 and never reaches the writer', async () => {
    const response = await post({
      artifacts: artifacts({
        panoramaIndex: {
          version: '1.0.0',
          panoramas: [{ id: 'pan-a', title: 'A', imageAssetId: '', position: { lat: 0, lng: 0 }, heading: 0, hotspots: [] }],
        },
      }),
    })

    expect(response.status).toBe(422)
    expect(writer()).not.toHaveBeenCalled()
  })

  it('CASE H — structural validation failures keep their existing status (missing graph -> 400)', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/publish', {
        method: 'POST',
        headers: { cookie: `navi-mock-session=${MOCK_SESSION}` },
        body: JSON.stringify({ artifacts: {}, campusId: CAMPUS, revision: 1 }),
      }),
    )
    expect(res.status).toBe(400)
    expect(writer()).not.toHaveBeenCalled()
  })

  it('retrying the same revision after a durable failure succeeds (manual retry is safe)', async () => {
    writer()
      .mockResolvedValueOnce({ status: 'error', message: RAW_DB_ERROR })
      .mockResolvedValueOnce({ status: 'published' })

    const first = await post()
    expect(first.status).toBe(503)

    const second = await post()
    const secondBody = await second.json()
    expect(second.status).toBe(200)
    expect(secondBody.success).toBe(true)
    // Two attempts, two calls — no 409 produced by the earlier failure.
    expect(writer()).toHaveBeenCalledTimes(2)
  })

  it('a durable failure response carries a controlled, actionable message', async () => {
    writer().mockResolvedValue({ status: 'error', message: RAW_DB_ERROR })
    const res = await post()
    const body = await res.json()

    expect(typeof body.message).toBe('string')
    expect(body.message.toLowerCase()).toContain('retry')
    // Never leaks a stack trace or internal path.
    expect(JSON.stringify(body)).not.toContain('at ')
  })

  // ---- Phase 5C-C: demo-output non-authoritative boundary ----
  it('CASE I — a demo-only PREPARATION failure after the durable commit is still a SUCCESS', async () => {
    writer().mockResolvedValue({ status: 'published' })

    const body = artifacts() as Record<string, unknown>
    // poiData is exclusively demo output: it is never validated, never
    // serialized before the durable write, and stringified at the EARLIEST
    // demo preparation step. A circular value makes that serialization throw
    // AFTER the canonical published_maps commit has already succeeded.
    const poiData: Record<string, unknown> = { version: '1.0.0', points: [] }
    poiData.self = poiData
    body.poiData = poiData

    const payload = { artifacts: body, campusId: CAMPUS, revision: 11 }
    const req = new NextRequest('http://localhost/api/publish', {
      method: 'POST',
      headers: { cookie: `navi-mock-session=${MOCK_SESSION}` },
      body: '{}',
    })
    // Nearest injectable seam: the route only reads the body via request.json().
    vi.spyOn(req, 'json').mockResolvedValue(payload as unknown as Record<string, unknown>)

    const res = await POST(req)
    const resBody = await res.json()

    // The durable commit already happened, so it cannot be reported as failed.
    expect(res.status).toBe(200)
    expect(resBody.success).toBe(true)
    // Exactly one durable write; no rollback, no retry, no second write.
    expect(writer()).toHaveBeenCalledTimes(1)
    // The demo-only failure detail must not reach the client.
    expect(JSON.stringify(resBody)).not.toContain('circular')
  })

  it('CASE J — a demo-only manifest/checksum failure is still a SUCCESS with accurate counts', async () => {
    writer().mockResolvedValue({ status: 'published' })

    const body = artifacts() as Record<string, unknown>
    body.navigationGraph = {
      version: '1.0.0',
      campusId: CAMPUS,
      createdAt: '2026-10-01T00:00:00.000Z',
      nodes: [
        { id: 'n1', name: 'N1', type: 'outdoor', position: { lat: 33.42, lng: -111.93 } },
        { id: 'n2', name: 'N2', type: 'outdoor', position: { lat: 33.43, lng: -111.94 } },
      ],
      edges: [],
    }
    // spatialIndex is demo-only and is stringified before the manifest is
    // built; a throwing toJSON reproduces a failure in demo preparation that
    // is NOT a filesystem failure.
    const spatialIndex = {
      version: '1.0.0',
      toJSON() {
        throw new Error('spatial index serialization exploded')
      },
    }
    body.spatialIndex = spatialIndex

    const payload = { artifacts: body, campusId: CAMPUS, revision: 11 }
    const req = new NextRequest('http://localhost/api/publish', {
      method: 'POST',
      headers: { cookie: `navi-mock-session=${MOCK_SESSION}` },
      body: '{}',
    })
    vi.spyOn(req, 'json').mockResolvedValue(payload as unknown as Record<string, unknown>)

    const res = await POST(req)
    const resBody = await res.json()

    expect(res.status).toBe(200)
    expect(resBody.success).toBe(true)
    expect(writer()).toHaveBeenCalledTimes(1)
    // Counts are pure derived scalars and stay correct regardless of demo output.
    expect(resBody.counts).toEqual({ nodes: 2, edges: 0 })
    expect(JSON.stringify(resBody)).not.toContain('exploded')
  })
})
