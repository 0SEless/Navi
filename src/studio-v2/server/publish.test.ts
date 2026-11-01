// @vitest-environment node
// The Save v2 publish handler, driven through a fake repository and a fake admin check
// with the real compiler on the Task 2 fixtures.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { fixtureFull, fixtureMinimal } from '../__fixtures__/campus-fixtures'
import { canonicalJson, sha256Hex } from '../parts/canonical'
import { splitDocument } from '../parts/split'
import { buildArtifactsBlob } from './artifacts-blob'
import type { VerifiedPrincipalResult } from './handlers'
import { createPublishHandlers } from './publish-handlers'
import type { StudioRepo } from './studio-repo'
import type { PartRecordWithVersion } from './types'

type Principal = { id: string; email: string | null; role: string; method: string }
const owner: Principal = { id: 'user-owner', email: 'owner@example.org', role: 'campus_admin', method: 'supabase' }
const root: Principal = { id: 'user-root', email: 'root@example.org', role: 'super_admin', method: 'supabase' }

/** fixtureFull with door-1 owned by a room that does not exist (compiles, fails artifact validation). */
function danglingDoorRoom(): CampusDocument {
  const doc = fixtureFull()
  const floor = doc.buildings[0].floors[0]
  floor.doors = (floor.doors ?? []).map((door) => (door.id === 'door-1' ? { ...door, roomId: 'room-ghost' } : door))
  return doc
}

/** fixtureFull with its entranceAccess pointing at an indoor route node that does not exist. */
function danglingEntranceAccess(): CampusDocument {
  const doc = fixtureFull()
  for (const building of doc.buildings) {
    for (const floor of building.floors) {
      if (floor.entranceAccess) {
        floor.entranceAccess = floor.entranceAccess.map((access) => ({ ...access, indoorRouteNodeId: 'rn-missing' }))
      }
    }
  }
  return doc
}

function partsOf(doc: CampusDocument): PartRecordWithVersion[] {
  return splitDocument(doc).parts.map((part) => ({
    partKey: part.key,
    versionNo: 1,
    checksum: '0'.repeat(64),
    sortKey: part.sortKey,
    content: part.content,
    contentBase64: null,
  }))
}

function fakeRepo(overrides: Record<string, unknown> = {}) {
  const repo = {
    partsAtCommit: vi.fn(async (_campusId: string, commitNo: number) => ({
      status: 'ok',
      commitNo,
      parts: partsOf(fixtureFull()),
    })),
    recordPublication: vi.fn(async () => ({ status: 'ok', publicationNo: 4 })),
    rollbackPublication: vi.fn(async () => ({ status: 'ok', publicationNo: 2 })),
    currentPublication: vi.fn(async () => ({ status: 'ok', publication: null })),
    load: vi.fn(async () => {
      throw new Error('publish must not read the head')
    }),
    changesSince: vi.fn(async () => {
      throw new Error('publish must not read the head')
    }),
    ...overrides,
  }
  return repo as unknown as StudioRepo & typeof repo
}

function setup(principal: Principal | null = owner, repo = fakeRepo()) {
  const verifyPrincipal = vi.fn(async (): Promise<VerifiedPrincipalResult> =>
    principal
      ? { ok: true as const, principal }
      : { ok: false as const, response: Response.json({ error: 'Authentication required.' }, { status: 401 }) },
  )
  return { repo, verifyPrincipal, handlers: createPublishHandlers({ repo, verifyPrincipal }) }
}

function post(body: unknown) {
  return new Request('http://localhost/api/studio/v2/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function bodyOf(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

type RecordCall = [string, number, Record<string, unknown>, string, string, boolean]

describe('publish from a saved commit', () => {
  it('compiles the parts at the given commit, not the head', async () => {
    const { handlers, repo } = setup()
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))

    expect(response.status).toBe(200)
    expect(await bodyOf(response)).toEqual({ publicationNo: 4, commitNo: 7 })
    expect(repo.partsAtCommit).toHaveBeenCalledTimes(1)
    expect(repo.partsAtCommit).toHaveBeenCalledWith('asu-ibajay', 7)
    expect(repo.load).not.toHaveBeenCalled()
    expect(repo.changesSince).not.toHaveBeenCalled()

    const [campusId, sourceCommit, blob, , actor, isSuperAdmin] = repo.recordPublication.mock.calls[0] as unknown as RecordCall
    expect(campusId).toBe('asu-ibajay')
    expect(sourceCommit).toBe(7)
    expect(actor).toBe('user-owner')
    expect(isSuperAdmin).toBe(false)
    // The commit's own content reached the compiler.
    const buildings = (blob.buildingIndex as { buildings: Array<{ id: string }> }).buildings.map((b) => b.id)
    expect(buildings).toEqual(expect.arrayContaining(['osm:way/123', 'bld-sci']))
  })

  it('a commit whose parts differ produces a publication of that commit only', async () => {
    const repo = fakeRepo({
      partsAtCommit: vi.fn(async (_campusId: string, commitNo: number) => ({
        status: 'ok',
        commitNo,
        parts: partsOf(fixtureMinimal()),
      })),
    })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post({ campusId: 'minimal-campus', commitNo: 2 }))
    expect(response.status).toBe(200)
    const blob = (repo.recordPublication.mock.calls[0] as unknown as RecordCall)[2]
    expect((blob.graph as { campusId: string }).campusId).toBe('minimal-campus')
    expect((blob.graph as { nodes: unknown[] }).nodes).toEqual([])
    expect((blob.buildingIndex as { buildings: unknown[] }).buildings).toEqual([])
  })

  it('the blob is buildArtifactsBlob(compile output) with revision = sourceDocumentVersion = commitNo, and the checksum is sha256(canonicalJson(blob))', async () => {
    const { handlers, repo } = setup()
    await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
    const [, , blob, checksum] = repo.recordPublication.mock.calls[0] as unknown as RecordCall

    expect(blob.metadata).toMatchObject({ campusId: 'asu-ibajay', revision: '7', sourceDocumentVersion: '7' })
    expect(checksum).toBe(await sha256Hex(canonicalJson(blob)))
    // Rebuilding the blob from its own compile-route artifacts is a fixed point: nothing
    // is added, dropped or reordered beyond what buildArtifactsBlob does.
    const rebuilt = buildArtifactsBlob(
      {
        ...blob,
        navigationGraph: blob.graph as Record<string, unknown>,
        poiData: blob.poiIndex,
      },
      'asu-ibajay',
      7,
      7,
    )
    expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(blob))
  })

  it('the blob equals buildArtifactsBlob over a fresh compile of the same commit (compiler counters reset)', async () => {
    vi.resetModules()
    const { CampusCompiler } = await import('@navi/compiler')
    const { joinParts } = await import('../parts/join')
    const doc = joinParts(partsOf(fixtureFull()).map((p) => ({ key: p.partKey, content: p.content, sortKey: p.sortKey })))
    const result = new CampusCompiler().compileV2(doc)
    const a = result.artifacts!
    const artifacts = JSON.parse(JSON.stringify({
      ...a,
      navigationGraph: result.graph,
      searchIndex: a.searchIndex ?? null,
      poiData: a.poiIndex ?? null,
      buildingIndex: a.buildingIndex ?? null,
      spatialIndex: a.spatialIndex ?? null,
      panoramaIndex: a.panoramaIndex ?? null,
      floorGeometry: a.floorGeometry ?? null,
      qrIndex: a.qrIndex ?? null,
      components: a.components ?? [],
      doors: a.doors ?? [],
      metadata: a.metadata ?? null,
    }))
    const expected = buildArtifactsBlob(artifacts, 'asu-ibajay', 7, 7)

    vi.resetModules()
    const fresh = await import('./publish-handlers')
    const repo = fakeRepo()
    const handlers = fresh.createPublishHandlers({
      repo,
      verifyPrincipal: async () => ({ ok: true as const, principal: owner }),
    })
    expect((await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))).status).toBe(200)
    const actual = (repo.recordPublication.mock.calls[0] as unknown as RecordCall)[2]

    const stripClock = (value: Record<string, unknown>) =>
      JSON.parse(JSON.stringify(value, (key, v) => (key === 'compiledAt' || key === 'createdAt' ? '<clock>' : v)))
    expect(stripClock(actual)).toEqual(stripClock(expected))
  })

  it('super_admin publishes with isSuperAdmin = true (the SQL decides ownership)', async () => {
    const { handlers, repo } = setup(root)
    expect((await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))).status).toBe(200)
    expect((repo.recordPublication.mock.calls[0] as unknown as RecordCall)[5]).toBe(true)
  })

  it('a document with a dangling entranceAccess gives 422 and records nothing', async () => {
    const repo = fakeRepo({
      partsAtCommit: vi.fn(async (_c: string, commitNo: number) => ({
        status: 'ok',
        commitNo,
        parts: partsOf(danglingEntranceAccess()),
      })),
    })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(422)
    const body = await bodyOf(response)
    expect(body.code).toBe('COMPILE_FAILED')
    expect(Array.isArray(body.diagnostics) && body.diagnostics.length > 0).toBe(true)
    expect(repo.recordPublication).not.toHaveBeenCalled()
  })

  it('artifacts that fail validateNavigationArtifacts give 422 ARTIFACT_INVALID with diagnostics and warnings', async () => {
    const repo = fakeRepo({
      partsAtCommit: vi.fn(async (_c: string, commitNo: number) => ({ status: 'ok', commitNo, parts: partsOf(danglingDoorRoom()) })),
    })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(422)
    const body = await bodyOf(response)
    expect(body.code).toBe('ARTIFACT_INVALID')
    expect(body.diagnostics).toEqual([expect.objectContaining({ code: 'ARTIFACT_INVALID_DOOR_REFERENCE' })])
    expect(Array.isArray(body.warnings)).toBe(true)
    expect(repo.recordPublication).not.toHaveBeenCalled()
  })

  it('a document whose campus id differs from the campus being published gives 422 ARTIFACT_INVALID', async () => {
    const { handlers, repo } = setup()
    const response = await handlers.publish(post({ campusId: 'other-campus', commitNo: 7 }))
    expect(response.status).toBe(422)
    const body = await bodyOf(response)
    expect(body.code).toBe('ARTIFACT_INVALID')
    expect(body.diagnostics).toEqual([expect.objectContaining({ code: 'ARTIFACT_CAMPUS_ID_MISMATCH' })])
    expect(repo.recordPublication).not.toHaveBeenCalled()
  })

  it('an empty graph cannot replace a non-empty current publication (legacy guard)', async () => {
    const repo = fakeRepo({
      partsAtCommit: vi.fn(async (_c: string, commitNo: number) => ({ status: 'ok', commitNo, parts: partsOf(fixtureMinimal()) })),
      currentPublication: vi.fn(async () => ({
        status: 'ok',
        publication: { publicationNo: 1, sourceCommit: 1, artifacts: { graph: { nodes: [{ id: 'n1' }], edges: [] } }, publishedAt: 'T', campusName: 'M', campusSettings: {} },
      })),
    })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post({ campusId: 'minimal-campus', commitNo: 2 }))
    expect(response.status).toBe(422)
    expect(await bodyOf(response)).toMatchObject({
      code: 'ARTIFACT_INVALID',
      diagnostics: [{ code: 'ARTIFACT_EMPTY_GRAPH_REPLACEMENT' }],
    })
    expect(repo.recordPublication).not.toHaveBeenCalled()
  })

  it('a binary (terrain tile) part gives 422 UNSUPPORTED_PART', async () => {
    const parts = partsOf(fixtureFull())
    parts.push({ partKey: 'terrain-tile:t1' as never, versionNo: 1, checksum: '0'.repeat(64), sortKey: null, content: null, contentBase64: 'AAAA' })
    const repo = fakeRepo({ partsAtCommit: vi.fn(async () => ({ status: 'ok', commitNo: 7, parts })) })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(422)
    expect(await bodyOf(response)).toEqual({ code: 'UNSUPPORTED_PART', parts: ['terrain-tile:t1'] })
  })

  it.each([
    ['not_found', 404, 'COMMIT_NOT_FOUND'],
    ['pruned', 409, 'COMMIT_PRUNED'],
    ['campus_not_found', 404, 'CAMPUS_NOT_FOUND'],
  ])('partsAtCommit %s gives %i %s', async (status, http, code) => {
    const repo = fakeRepo({ partsAtCommit: vi.fn(async () => ({ status })) })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(http)
    expect((await bodyOf(response)).code).toBe(code)
    expect(repo.recordPublication).not.toHaveBeenCalled()
  })

  it.each([
    ['pruned', 409, 'COMMIT_PRUNED'],
    ['forbidden', 403, 'FORBIDDEN'],
    ['campus_not_found', 404, 'CAMPUS_NOT_FOUND'],
  ])('recordPublication %s gives %i %s', async (status, http, code) => {
    const repo = fakeRepo({ recordPublication: vi.fn(async () => ({ status })) })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(http)
    expect((await bodyOf(response)).code).toBe(code)
  })

  it('a 22023 from recordPublication gives 400', async () => {
    const error = Object.assign(new Error('INVALID_ARGUMENT: source commit must be between 1 and the head commit (3).'), { code: '22023' })
    const repo = fakeRepo({ recordPublication: vi.fn(async () => { throw error }) })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(400)
    expect((await bodyOf(response)).code).toBe('INVALID_REQUEST')
  })

  it('a missing database configuration gives 503 SAVE_V2_NOT_CONFIGURED', async () => {
    const repo = fakeRepo({ partsAtCommit: vi.fn(async () => { throw new Error('NAVI_STUDIO_DATABASE_URL is not set.') }) })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(503)
    expect((await bodyOf(response)).code).toBe('SAVE_V2_NOT_CONFIGURED')
  })

  it('authenticates first: no repository call without a principal', async () => {
    const { handlers, repo } = setup(null)
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(401)
    expect(repo.partsAtCommit).not.toHaveBeenCalled()
    expect(repo.rollbackPublication).not.toHaveBeenCalled()
  })

  it.each([
    [{ campusId: 'asu-ibajay' }],
    [{ campusId: 'asu-ibajay', commitNo: 7, rollbackTo: 2 }],
    [{ campusId: 'asu-ibajay', commitNo: 0 }],
    [{ campusId: 'asu-ibajay', commitNo: 1.5 }],
    [{ campusId: 'asu-ibajay', commitNo: '7' }],
    [{ campusId: 'asu-ibajay', rollbackTo: -1 }],
    [{ commitNo: 7 }],
  ])('rejects a malformed body %j with 400', async (body) => {
    const { handlers, repo } = setup()
    const response = await handlers.publish(post(body))
    expect(response.status).toBe(400)
    expect(repo.partsAtCommit).not.toHaveBeenCalled()
    expect(repo.rollbackPublication).not.toHaveBeenCalled()
  })

  it('never writes demo-output files or published_maps', () => {
    const source = readFileSync(join(__dirname, 'publish-handlers.ts'), 'utf8')
    expect(source).not.toMatch(/from ['"](node:)?fs['"]|writeFileSync|@supabase|published-map-writer|from\(['"]published_maps/)
  })
})

describe('rollback', () => {
  it('ok gives 200 { publicationNo }', async () => {
    const { handlers, repo } = setup(root)
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', rollbackTo: 2 }))
    expect(response.status).toBe(200)
    expect(await bodyOf(response)).toEqual({ publicationNo: 2 })
    expect(repo.rollbackPublication).toHaveBeenCalledWith('asu-ibajay', 2, 'user-root', true)
    expect(repo.partsAtCommit).not.toHaveBeenCalled()
  })

  it.each([
    ['not_found', 404, 'PUBLICATION_NOT_FOUND'],
    ['forbidden', 403, 'FORBIDDEN'],
    ['campus_not_found', 404, 'CAMPUS_NOT_FOUND'],
  ])('%s gives %i %s', async (status, http, code) => {
    const repo = fakeRepo({ rollbackPublication: vi.fn(async () => ({ status })) })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', rollbackTo: 2 }))
    expect(response.status).toBe(http)
    expect((await bodyOf(response)).code).toBe(code)
  })
})
