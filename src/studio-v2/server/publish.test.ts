// @vitest-environment node
// The Save v2 publish handler, driven through a fake repository and a fake admin check
// with the real compiler on the Task 2 fixtures.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CampusCompiler } from '@navi/compiler'
import type { CampusDocument } from '@navi/core'
import { fixtureFull, fixtureMinimal, fixtureTerrain } from '../__fixtures__/campus-fixtures'
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

/** fixtureFull with its entranceAccess naming an entrance that does not exist (compiles cleanly). */
function danglingEntranceId(): CampusDocument {
  const doc = fixtureFull()
  for (const building of doc.buildings) {
    for (const floor of building.floors) {
      if (floor.entranceAccess) {
        floor.entranceAccess = floor.entranceAccess.map((access) => ({ ...access, entranceId: 'ent-missing' }))
      }
    }
  }
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
    content: part.contentBase64 !== undefined ? null : part.content,
    contentBase64: part.contentBase64 ?? null,
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
    roleOf: vi.fn(async () => 'owner'),
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
    // Terrain plan: publish also carries the campus-only site package for a campus with a boundary.
    const { buildSiteArtifact } = await import('@navi/core')
    const expected = buildArtifactsBlob({ ...artifacts, site: JSON.parse(JSON.stringify(buildSiteArtifact(doc))) }, 'asu-ibajay', 7, 7)

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

  it('a dangling entranceAccess indoor route node gives 422 (caught by the route gate, R33) and records nothing', async () => {
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
    expect(body.code).toBe('ROUTE_INVALID')
    expect(body.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining('rn-missing') }),
    ]))
    expect(repo.recordPublication).not.toHaveBeenCalled()
  })

  it('a compile that fails gives 422 COMPILE_FAILED with the compiler errors', async () => {
    const errors = [{ code: 'HALLWAY_DISCONNECTED', message: 'Disconnected component', severity: 'error' }]
    const compile = vi.spyOn(CampusCompiler.prototype, 'compileV2').mockReturnValue({ success: false, errors } as never)
    try {
      const { handlers, repo } = setup()
      const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
      expect(response.status).toBe(422)
      expect(await bodyOf(response)).toEqual({ code: 'COMPILE_FAILED', diagnostics: errors })
      expect(repo.recordPublication).not.toHaveBeenCalled()
    } finally {
      compile.mockRestore()
    }
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

  it('a terrain tile part is accepted and publishes', async () => {
    const parts = partsOf(fixtureFull())
    parts.push({ partKey: 'terrain-tile:0_0' as never, versionNo: 1, checksum: '0'.repeat(64), sortKey: null, content: null, contentBase64: Buffer.alloc(32768).toString('base64') })
    const repo = fakeRepo({ partsAtCommit: vi.fn(async () => ({ status: 'ok', commitNo: 7, parts })) })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(200)
    expect(repo.recordPublication).toHaveBeenCalledTimes(1)
  })

  it('a binary part that is not a terrain tile gives 422 UNSUPPORTED_PART', async () => {
    const parts = partsOf(fixtureFull())
    const road = parts.find((part) => part.partKey.startsWith('map/road:'))!
    road.content = null
    road.contentBase64 = 'AAAA'
    const repo = fakeRepo({ partsAtCommit: vi.fn(async () => ({ status: 'ok', commitNo: 7, parts })) })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(422)
    expect(await bodyOf(response)).toEqual({ code: 'UNSUPPORTED_PART', parts: [road.partKey] })
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

const withParts = (doc: CampusDocument) =>
  fakeRepo({ partsAtCommit: vi.fn(async (_c: string, commitNo: number) => ({ status: 'ok', commitNo, parts: partsOf(doc) })) })

describe('route-network hard gate (R33)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('a dangling entranceId gives 422 ROUTE_INVALID before compiling; nothing is recorded', async () => {
    const compile = vi.spyOn(CampusCompiler.prototype, 'compileV2')
    const repo = withParts(danglingEntranceId())
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(422)
    const body = await bodyOf(response)
    expect(body.code).toBe('ROUTE_INVALID')
    const diagnostics = body.diagnostics as Array<{ severity: string; ruleId: string; message: string }>
    expect(diagnostics.length).toBeGreaterThan(0)
    expect(diagnostics.every((issue) => issue.severity === 'error')).toBe(true)
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'route-entrance-access', message: expect.stringContaining('ent-missing') }),
    ]))
    expect(compile).not.toHaveBeenCalled()
    expect(repo.recordPublication).not.toHaveBeenCalled()
  })

  it('publish without terrain omits site', async () => {
    const doc = fixtureFull()
    delete doc.boundary
    const repo = fakeRepo({ partsAtCommit: vi.fn(async () => ({ status: 'ok', commitNo: 7, parts: partsOf(doc) })) })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(200)
    const blob = repo.recordPublication.mock.calls[0][2] as Record<string, unknown>
    expect('site' in blob).toBe(false)
  })

  it('publish with terrain adds site with baked terrain', async () => {
    const doc = fixtureTerrain()
    const repo = fakeRepo({ partsAtCommit: vi.fn(async () => ({ status: 'ok', commitNo: 7, parts: partsOf(doc) })) })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(200)
    const site = (repo.recordPublication.mock.calls[0][2] as { site: { version: number; terrain: { cols: number } | null; structures: unknown[] } }).site
    expect(site.version).toBe(1)
    expect(site.terrain!.cols).toBeGreaterThan(0)
    expect(site.structures).toHaveLength(2)
  })

  it('a valid fixtureFull passes the gate, compiles once and publishes', async () => {
    const compile = vi.spyOn(CampusCompiler.prototype, 'compileV2')
    const { handlers, repo } = setup()
    const response = await handlers.publish(post({ campusId: 'asu-ibajay', commitNo: 7 }))
    expect(response.status).toBe(200)
    expect(compile).toHaveBeenCalledTimes(1)
    expect(repo.recordPublication).toHaveBeenCalledTimes(1)
  })
})

describe('protected campus gate (R35)', () => {
  const PROTECTED = 'map-map-1-k6bv'
  afterEach(() => {
    delete process.env.NAVI_PROTECTED_CAMPUS_WRITES
  })

  it.each([
    [{ campusId: PROTECTED, commitNo: 7 }],
    [{ campusId: PROTECTED, rollbackTo: 2 }],
  ])('%j gives 423 and touches nothing', async (body) => {
    const { handlers, repo } = setup(root)
    const response = await handlers.publish(post(body))
    expect(response.status).toBe(423)
    expect(await bodyOf(response)).toEqual({ error: 'This campus is protected. Mutations are disabled.' })
    expect(repo.roleOf).not.toHaveBeenCalled()
    expect(repo.partsAtCommit).not.toHaveBeenCalled()
    expect(repo.rollbackPublication).not.toHaveBeenCalled()
    expect(repo.recordPublication).not.toHaveBeenCalled()
  })

  it('with NAVI_PROTECTED_CAMPUS_WRITES=1 publish and rollback proceed', async () => {
    process.env.NAVI_PROTECTED_CAMPUS_WRITES = '1'
    const { handlers, repo } = setup(root)
    await handlers.publish(post({ campusId: PROTECTED, commitNo: 7 }))
    expect(repo.partsAtCommit).toHaveBeenCalledWith(PROTECTED, 7)
    const rollback = await handlers.publish(post({ campusId: PROTECTED, rollbackTo: 2 }))
    expect(rollback.status).toBe(200)
    expect(repo.rollbackPublication).toHaveBeenCalledWith(PROTECTED, 2, 'user-root', true)
  })

  it('unauthenticated requests are refused before the protected-campus check', async () => {
    const { handlers } = setup(null)
    expect((await handlers.publish(post({ campusId: PROTECTED, commitNo: 7 }))).status).toBe(401)
  })
})

describe('role pre-check (R36)', () => {
  it.each([
    [{ campusId: 'asu-ibajay', commitNo: 7 }],
    [{ campusId: 'asu-ibajay', rollbackTo: 2 }],
  ])('an editor gets 403 for %j before any publish work', async (body) => {
    const repo = fakeRepo({ roleOf: vi.fn(async () => 'editor') })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post(body))
    expect(response.status).toBe(403)
    expect((await bodyOf(response)).code).toBe('FORBIDDEN')
    expect(repo.roleOf).toHaveBeenCalledWith('asu-ibajay', 'user-owner')
    expect(repo.partsAtCommit).not.toHaveBeenCalled()
    expect(repo.rollbackPublication).not.toHaveBeenCalled()
    expect(repo.recordPublication).not.toHaveBeenCalled()
  })

  it.each([
    [{ campusId: 'asu-ibajay', commitNo: 7 }],
    [{ campusId: 'asu-ibajay', rollbackTo: 2 }],
  ])('an unknown campus (roleOf null) gives 404 CAMPUS_NOT_FOUND for %j', async (body) => {
    const repo = fakeRepo({ roleOf: vi.fn(async () => null) })
    const { handlers } = setup(owner, repo)
    const response = await handlers.publish(post(body))
    expect(response.status).toBe(404)
    expect((await bodyOf(response)).code).toBe('CAMPUS_NOT_FOUND')
    expect(repo.partsAtCommit).not.toHaveBeenCalled()
    expect(repo.rollbackPublication).not.toHaveBeenCalled()
  })

  it('an owner passes; a super_admin skips the role lookup', async () => {
    const asOwner = setup(owner)
    expect((await asOwner.handlers.publish(post({ campusId: 'asu-ibajay', rollbackTo: 2 }))).status).toBe(200)
    expect(asOwner.repo.roleOf).toHaveBeenCalledTimes(1)
    const asRoot = setup(root)
    expect((await asRoot.handlers.publish(post({ campusId: 'asu-ibajay', rollbackTo: 2 }))).status).toBe(200)
    expect(asRoot.repo.roleOf).not.toHaveBeenCalled()
  })
})

describe('route file', () => {
  it('allows up to 60 seconds (maxDuration)', async () => {
    const route = await import('../../app/api/studio/v2/publish/route')
    expect(route.maxDuration).toBe(60)
    expect(route.runtime).toBe('nodejs')
  })
})

describe('server-safe imports (the publish route runs in the react-server layer)', () => {
  const ROUTE_NETWORK = '@navi/editor/src/validation/rules/modules/route-network'
  const specifiers = (file: string, typeOnly: boolean) => {
    const source = readFileSync(file, 'utf8')
    const found: string[] = []
    for (const match of source.matchAll(/^\s*(import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
      if (typeOnly || !match[2]) found.push(match[3])
    }
    for (const match of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(match[1])
    return found
  }

  it('publish-handlers.ts never imports the @navi/editor root, the validation barrel or editor context', () => {
    const imports = specifiers(join(__dirname, 'publish-handlers.ts'), true)
    expect(imports).toContain(ROUTE_NETWORK)
    for (const spec of imports) {
      expect(spec).not.toBe('@navi/editor')
      expect(spec).not.toMatch(/^@navi\/editor\/src\/context(\/|$)/)
      expect(spec).not.toMatch(/^@navi\/editor\/src\/validation(\/index)?$/)
      if (spec.startsWith('@navi/editor/')) expect(spec).toBe(ROUTE_NETWORK)
      expect(spec).not.toMatch(/(^|\/)packages\//)
    }
  })

  it('route-network.ts has no runtime import other than @navi/core', () => {
    const file = join(__dirname, '../../../packages/editor/src/validation/rules/modules/route-network.ts')
    expect(specifiers(file, false)).toEqual(['@navi/core'])
  })
})
