// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { canonicalJson, sha256Hex } from '../parts/canonical'
import { createStudioHandlers, STUDIO_BODY_MAX_BYTES, type VerifiedPrincipalResult } from './handlers'
import type { StudioRepo } from './studio-repo'

// The handlers are exercised through a fake repository and a fake admin check, so the
// whole HTTP contract (statuses, validation, server-side checksums) is tested without
// a database or a Next server.

const SESSION = '3b241101-e2bb-4255-8caf-4136c566a962'
const OTHER_SESSION = '9f1c2b3a-0d4e-4f5a-8b6c-7d8e9f0a1b2c'

type Principal = { id: string; email: string | null; role: string; method: 'supabase' | 'mock' }
const alice: Principal = { id: 'user-alice', email: 'alice@example.org', role: 'campus_admin', method: 'supabase' }
const bob: Principal = { id: 'user-bob', email: 'bob@example.org', role: 'campus_admin', method: 'supabase' }
const root: Principal = { id: 'user-root', email: 'root@example.org', role: 'super_admin', method: 'supabase' }

function fakeRepo(overrides: Record<string, unknown> = {}) {
  const repo = {
    save: vi.fn(),
    acquireZones: vi.fn(),
    releaseZones: vi.fn(),
    status: vi.fn(),
    forceRelease: vi.fn(),
    load: vi.fn(),
    changesSince: vi.fn(),
    listCampuses: vi.fn(),
    createCampus: vi.fn(),
    deleteCampus: vi.fn(),
    updateCampusSettings: vi.fn(),
    roleOf: vi.fn(),
    ...overrides,
  }
  return repo as unknown as StudioRepo & typeof repo
}

function setup(principal: Principal | null = alice, repo: ReturnType<typeof fakeRepo> = fakeRepo()) {
  const verifyPrincipal = vi.fn(async (_request: Request): Promise<VerifiedPrincipalResult> =>
    principal
      ? { ok: true as const, principal }
      : { ok: false as const, response: Response.json({ error: 'Authentication required.' }, { status: 401 }) },
  )
  return { repo, verifyPrincipal, handlers: createStudioHandlers({ repo, verifyPrincipal }) }
}

function post(path: string, body: unknown, headers: Record<string, string> = { 'x-navi-studio-session': SESSION }) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const floorContent = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  rooms: [],
  hallways: [],
  staircases: [],
  elevators: [],
  entrances: [],
  connectorStops: [],
  parametricComponents: [],
  metadata: {},
  ...extra,
})
const road = { id: 'r1', points: [] }

function saveBody(changes: unknown[], over: Record<string, unknown> = {}) {
  return { campusId: 'c1', mutationId: 'm-1', baseCommit: 4, message: 'msg', changes, ...over }
}

const okSave = { status: 'ok', commitNo: 5, parts: [{ partKey: 'map/road:r1', versionNo: 1, checksum: 'x' }], othersChanged: [] }

async function bodyOf(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

describe('save: status mapping', () => {
  const changes = [{ partKey: 'map/road:r1', expectedVersion: 0, op: 'put', content: road, sortKey: 'a0' }]

  it('ok -> 200 with commitNo, parts and othersChanged', async () => {
    const { handlers, repo } = setup()
    repo.save.mockResolvedValue(okSave)
    const response = await handlers.save(post('/api/studio/v2/save', saveBody(changes)))
    expect(response.status).toBe(200)
    expect(await bodyOf(response)).toEqual({ status: 'ok', commitNo: 5, parts: okSave.parts, othersChanged: [] })
  })

  it('replay -> 200 with status replay', async () => {
    const { handlers, repo } = setup()
    repo.save.mockResolvedValue({ ...okSave, status: 'replay' })
    const response = await handlers.save(post('/api/studio/v2/save', saveBody(changes)))
    expect(response.status).toBe(200)
    expect((await bodyOf(response)).status).toBe('replay')
  })

  it('stale -> 409 STALE_PART with the parts', async () => {
    const { handlers, repo } = setup()
    const parts = [{ partKey: 'map/road:r1', yourVersion: 0, currentVersion: 2, savedBy: 'ana', savedAt: 'now' }]
    repo.save.mockResolvedValue({ status: 'stale', parts })
    const response = await handlers.save(post('/api/studio/v2/save', saveBody(changes)))
    expect(response.status).toBe(409)
    expect(await bodyOf(response)).toEqual({ code: 'STALE_PART', parts })
  })

  it('zone_not_held -> 423 ZONE_NOT_HELD with the zones', async () => {
    const { handlers, repo } = setup()
    const zones = [{ zoneKey: 'building:B1', holderName: 'ana' }]
    repo.save.mockResolvedValue({ status: 'zone_not_held', zones })
    const response = await handlers.save(post('/api/studio/v2/save', saveBody(changes)))
    expect(response.status).toBe(423)
    expect(await bodyOf(response)).toEqual({ code: 'ZONE_NOT_HELD', zones })
  })

  it('mutation_collision -> 409 MUTATION_ID_COLLISION', async () => {
    const { handlers, repo } = setup()
    repo.save.mockResolvedValue({ status: 'mutation_collision' })
    const response = await handlers.save(post('/api/studio/v2/save', saveBody(changes)))
    expect(response.status).toBe(409)
    expect(await bodyOf(response)).toEqual({ code: 'MUTATION_ID_COLLISION' })
  })

  it('forbidden (viewer) -> 403 FORBIDDEN', async () => {
    const { handlers, repo } = setup()
    repo.save.mockResolvedValue({ status: 'forbidden' })
    const response = await handlers.save(post('/api/studio/v2/save', saveBody(changes)))
    expect(response.status).toBe(403)
    expect(await bodyOf(response)).toEqual({ code: 'FORBIDDEN' })
  })

  it('campus_not_found -> 404 CAMPUS_NOT_FOUND', async () => {
    const { handlers, repo } = setup()
    repo.save.mockResolvedValue({ status: 'campus_not_found' })
    const response = await handlers.save(post('/api/studio/v2/save', saveBody(changes)))
    expect(response.status).toBe(404)
    expect(await bodyOf(response)).toEqual({ code: 'CAMPUS_NOT_FOUND' })
  })

  it('database error 22023 -> 400 INVALID_REQUEST with the database message', async () => {
    const { handlers, repo } = setup()
    repo.save.mockRejectedValue(Object.assign(new Error('INVALID_CHANGE: partKey "x" has an unknown op.'), { code: '22023' }))
    const response = await handlers.save(post('/api/studio/v2/save', saveBody(changes)))
    expect(response.status).toBe(400)
    expect(await bodyOf(response)).toEqual({
      code: 'INVALID_REQUEST',
      message: 'INVALID_CHANGE: partKey "x" has an unknown op.',
    })
  })

  it('database error 23505 on the mutation-id constraint -> 409 MUTATION_ID_COLLISION', async () => {
    const { handlers, repo } = setup()
    repo.save.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'commits_campus_id_mutation_id_key' }),
    )
    const response = await handlers.save(post('/api/studio/v2/save', saveBody(changes)))
    expect(response.status).toBe(409)
    expect(await bodyOf(response)).toEqual({ code: 'MUTATION_ID_COLLISION' })
  })

  it('any other database error -> 500 INTERNAL without leaking details', async () => {
    const { handlers, repo } = setup()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    repo.save.mockRejectedValue(Object.assign(new Error('secret connection detail'), { code: '08006' }))
    const response = await handlers.save(post('/api/studio/v2/save', saveBody(changes)))
    expect(response.status).toBe(500)
    const text = JSON.stringify(await bodyOf(response))
    expect(text).toBe(JSON.stringify({ code: 'INTERNAL' }))
    expect(JSON.stringify(logged.mock.calls)).not.toContain('secret connection detail')
    logged.mockRestore()
  })

  it('a 23505 on another constraint is not a mutation collision', async () => {
    const { handlers, repo } = setup()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    repo.save.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505', constraint: 'other_key' }))
    const response = await handlers.save(post('/api/studio/v2/save', saveBody(changes)))
    expect(response.status).toBe(500)
    logged.mockRestore()
  })
})

describe('save: validation and server-side checksums', () => {
  it('rejects planImageId with 400 NOT_ALLOWED_IN_1_5 and never calls the repository', async () => {
    const { handlers, repo } = setup()
    const response = await handlers.save(
      post(
        '/api/studio/v2/save',
        saveBody([
          { partKey: 'floor:B1:F1', expectedVersion: 0, op: 'put', content: floorContent('F1', { planImageId: 'img' }) },
        ]),
      ),
    )
    expect(response.status).toBe(400)
    const body = await bodyOf(response)
    expect(body.code).toBe('NOT_ALLOWED_IN_1_5')
    expect(body.details).toEqual([expect.objectContaining({ key: 'floor:B1:F1', code: 'NOT_ALLOWED_IN_1_5', path: '/planImageId' })])
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('reports the issues of all changes, the first one gives the code', async () => {
    const { handlers } = setup()
    const response = await handlers.save(
      post(
        '/api/studio/v2/save',
        saveBody([
          { partKey: 'nonsense', expectedVersion: 0, op: 'put', content: {} },
          { partKey: 'floor:B1:F1', expectedVersion: 0, op: 'put', content: floorContent('F1', { planImageId: 'img' }) },
        ]),
      ),
    )
    const body = await bodyOf(response)
    expect(body.code).toBe('UNKNOWN_PART_KIND')
    expect((body.details as unknown[]).length).toBeGreaterThanOrEqual(2)
  })

  it('computes checksum and sizeBytes server-side and ignores client values', async () => {
    const { handlers, repo } = setup()
    repo.save.mockResolvedValue(okSave)
    const content = { id: 'r1', points: [], extra: { b: 2, a: 1 } }
    const canonical = canonicalJson(content)
    const response = await handlers.save(
      post(
        '/api/studio/v2/save',
        saveBody([
          {
            partKey: 'map/road:r1',
            expectedVersion: 0,
            op: 'put',
            content,
            sortKey: 'a0',
            checksum: 'f'.repeat(64),
            sizeBytes: 1,
          },
        ]),
      ),
    )
    expect(response.status).toBe(200)
    const input = repo.save.mock.calls[0][0]
    expect(input.changes).toEqual([
      {
        partKey: 'map/road:r1',
        expectedVersion: 0,
        op: 'put',
        content,
        sortKey: 'a0',
        checksum: createHash('sha256').update(canonical).digest('hex'),
        sizeBytes: Buffer.byteLength(canonical),
      },
    ])
    expect(input).toMatchObject({
      campusId: 'c1',
      actor: 'user-alice',
      session: SESSION,
      mutationId: 'm-1',
      baseCommit: 4,
      message: 'msg',
    })
  })

  it('put-bin: decodes the bytes, checksums them and drops client values', async () => {
    const { handlers, repo } = setup()
    repo.save.mockResolvedValue(okSave)
    const bytes = Buffer.from([0, 1, 2, 3, 250, 251])
    const response = await handlers.save(
      post(
        '/api/studio/v2/save',
        saveBody([
          {
            partKey: 'terrain-tile:t1',
            expectedVersion: 0,
            op: 'put-bin',
            contentBase64: bytes.toString('base64'),
            checksum: 'f'.repeat(64),
          },
        ]),
      ),
    )
    expect(response.status).toBe(200)
    expect(repo.save.mock.calls[0][0].changes).toEqual([
      {
        partKey: 'terrain-tile:t1',
        expectedVersion: 0,
        op: 'put-bin',
        contentBase64: bytes.toString('base64'),
        checksum: createHash('sha256').update(bytes).digest('hex'),
      },
    ])
  })

  it('put-bin over the part size limit -> 400 TOO_LARGE', async () => {
    const { handlers, repo } = setup()
    const response = await handlers.save(
      post(
        '/api/studio/v2/save',
        saveBody([
          {
            partKey: 'terrain-tile:t1',
            expectedVersion: 0,
            op: 'put-bin',
            contentBase64: Buffer.alloc(2_097_153, 1).toString('base64'),
          },
        ]),
      ),
    )
    expect(response.status).toBe(400)
    expect((await bodyOf(response)).code).toBe('TOO_LARGE')
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('put-bin with malformed base64 -> 400', async () => {
    const { handlers } = setup()
    const response = await handlers.save(
      post(
        '/api/studio/v2/save',
        saveBody([{ partKey: 'terrain-tile:t1', expectedVersion: 0, op: 'put-bin', contentBase64: '***' }]),
      ),
    )
    expect(response.status).toBe(400)
    expect((await bodyOf(response)).code).toBe('INVALID_PART')
  })

  it('delete changes go through without content checks', async () => {
    const { handlers, repo } = setup()
    repo.save.mockResolvedValue(okSave)
    const response = await handlers.save(
      post('/api/studio/v2/save', saveBody([{ partKey: 'floor:B1:F1', expectedVersion: 3, op: 'delete' }])),
    )
    expect(response.status).toBe(200)
    expect(repo.save.mock.calls[0][0].changes).toEqual([{ partKey: 'floor:B1:F1', expectedVersion: 3, op: 'delete' }])
  })

  it('a map-item put without a sortKey -> 400 INVALID_PART on /sortKey', async () => {
    const { handlers, repo } = setup()
    const response = await handlers.save(
      post('/api/studio/v2/save', saveBody([{ partKey: 'map/road:r1', expectedVersion: 0, op: 'put', content: road }])),
    )
    expect(response.status).toBe(400)
    const body = await bodyOf(response)
    expect(body.code).toBe('INVALID_PART')
    expect(body.details).toEqual([expect.objectContaining({ key: 'map/road:r1', code: 'INVALID_PART', path: '/sortKey' })])
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('R15: the request checksum covers the actor, so two actors with the same body differ', async () => {
    const changes = [{ partKey: 'map/road:r1', expectedVersion: 0, op: 'put', content: road, sortKey: 'a0' }]
    const one = setup(alice)
    const two = setup(bob)
    one.repo.save.mockResolvedValue(okSave)
    two.repo.save.mockResolvedValue(okSave)
    await one.handlers.save(post('/api/studio/v2/save', saveBody(changes)))
    await two.handlers.save(post('/api/studio/v2/save', saveBody(changes)))
    const a = one.repo.save.mock.calls[0][0].requestChecksum as string
    const b = two.repo.save.mock.calls[0][0].requestChecksum as string
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
    expect(a).toBe(await sha256Hex(canonicalJson({ actor: 'user-alice', baseCommit: 4, changes })))
  })

  it('R15: a retry of the same body gives the same request checksum', async () => {
    const { handlers, repo } = setup()
    repo.save.mockResolvedValue(okSave)
    const changes = [{ partKey: 'map/road:r1', expectedVersion: 0, op: 'put', content: road, sortKey: 'a0' }]
    await handlers.save(post('/api/studio/v2/save', saveBody(changes)))
    await handlers.save(post('/api/studio/v2/save', saveBody(changes)))
    expect(repo.save.mock.calls[0][0].requestChecksum).toBe(repo.save.mock.calls[1][0].requestChecksum)
  })

  it('rejects malformed requests with 400 INVALID_REQUEST', async () => {
    const { handlers, repo } = setup()
    for (const body of [
      saveBody([], { campusId: '' }),
      saveBody([], { campusId: ' c1' }),
      saveBody([], { mutationId: undefined }),
      saveBody([], { baseCommit: -1 }),
      saveBody([], { baseCommit: 1.5 }),
      saveBody([], { message: 4 }),
      saveBody('nope' as unknown as unknown[]),
      saveBody([{ partKey: 'map/road:r1', expectedVersion: -1, op: 'put' }]),
      saveBody([{ partKey: 'map/road:r1', expectedVersion: 0, op: 'wipe' }]),
    ]) {
      const response = await handlers.save(post('/api/studio/v2/save', body))
      expect(response.status).toBe(400)
      expect((await bodyOf(response)).code).toBe('INVALID_REQUEST')
    }
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('invalid JSON -> 400 INVALID_JSON', async () => {
    const { handlers } = setup()
    const response = await handlers.save(post('/api/studio/v2/save', '{not json'))
    expect(response.status).toBe(400)
    expect(await bodyOf(response)).toEqual({ code: 'INVALID_JSON' })
  })
})

describe('authentication, session and body limit', () => {
  it('401 without a principal, on every endpoint, before touching the repository', async () => {
    const { handlers, repo } = setup(null)
    const responses = await Promise.all([
      handlers.listCampuses(new Request('http://localhost/x')),
      handlers.createCampus(post('/x', { campusId: 'c', name: 'n' })),
      handlers.updateCampus(post('/x', { campusId: 'c', settings: {} })),
      handlers.deleteCampus(new Request('http://localhost/x?campus_id=c', { method: 'DELETE' })),
      handlers.load(new Request('http://localhost/x'), { id: 'c' }),
      handlers.changes(new Request('http://localhost/x?since=0'), { id: 'c' }),
      handlers.save(post('/x', saveBody([]))),
      handlers.locks(post('/x', { campusId: 'c', acquire: [] })),
      handlers.status(post('/x', { campusId: 'c', held: [] })),
    ])
    expect(responses.map((r) => r.status)).toEqual(Array(9).fill(401))
    for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled()
  })

  it('returns the verifier response for a non-admin (403)', async () => {
    const verifyPrincipal = vi.fn(async (_request: Request): Promise<VerifiedPrincipalResult> => ({
      ok: false as const,
      response: Response.json({ error: 'Administrator authorization required.' }, { status: 403 }),
    }))
    const handlers = createStudioHandlers({ repo: fakeRepo(), verifyPrincipal })
    const response = await handlers.save(post('/x', saveBody([])))
    expect(response.status).toBe(403)
  })

  it('a viewer gets 403 on save and on acquire (database forbidden)', async () => {
    const { handlers, repo } = setup()
    repo.save.mockResolvedValue({ status: 'forbidden' })
    repo.acquireZones.mockResolvedValue({ status: 'forbidden' })
    expect((await handlers.save(post('/x', saveBody([])))).status).toBe(403)
    expect((await handlers.locks(post('/x', { campusId: 'c1', acquire: ['campus'] }))).status).toBe(403)
  })

  it('the body limit is 4 MiB', () => {
    expect(STUDIO_BODY_MAX_BYTES).toBe(4_194_304)
  })

  it('413 when the body is just over 4 MiB, and not 413 when exactly at the limit', async () => {
    const { handlers, repo } = setup()
    repo.save.mockResolvedValue({ ...okSave, commitNo: null, parts: [] })
    const sized = (bytes: number) => {
      const base = JSON.stringify(saveBody([], { message: '' }))
      return JSON.stringify(saveBody([], { message: 'x'.repeat(bytes - Buffer.byteLength(base)) }))
    }
    const over = sized(STUDIO_BODY_MAX_BYTES + 1)
    expect(Buffer.byteLength(over)).toBe(STUDIO_BODY_MAX_BYTES + 1)
    const response = await handlers.save(post('/x', over))
    expect(response.status).toBe(413)
    expect(await bodyOf(response)).toEqual({ code: 'BODY_TOO_LARGE' })
    expect(repo.save).not.toHaveBeenCalled()

    const under = sized(STUDIO_BODY_MAX_BYTES)
    expect(Buffer.byteLength(under)).toBe(STUDIO_BODY_MAX_BYTES)
    expect((await handlers.save(post('/x', under))).status).toBe(200)
    expect(repo.save).toHaveBeenCalledTimes(1)
  })

  it('413 early when Content-Length already exceeds 4 MiB', async () => {
    const { handlers } = setup()
    const request = post('/x', saveBody([]), {
      'x-navi-studio-session': SESSION,
      'content-length': String(STUDIO_BODY_MAX_BYTES + 1),
    })
    const response = await handlers.save(request)
    expect(response.status).toBe(413)
  })

  it('counts UTF-8 bytes, not characters, against the limit', async () => {
    const { handlers } = setup()
    // 3 bytes per character: fewer than 4M characters but more than 4 MiB.
    const wide = JSON.stringify(saveBody([], { message: '€'.repeat(1_500_000) }))
    expect(wide.length).toBeLessThan(STUDIO_BODY_MAX_BYTES)
    const response = await handlers.save(post('/x', wide))
    expect(response.status).toBe(413)
  })

  it('missing or invalid session header -> 400 SESSION_REQUIRED (save, locks, status)', async () => {
    const { handlers, repo } = setup()
    for (const headers of [{} as Record<string, string>, { 'x-navi-studio-session': 'not-a-uuid' }, { 'x-navi-studio-session': `${SESSION}x` }]) {
      for (const call of [
        handlers.save(post('/x', saveBody([]), headers)),
        handlers.locks(post('/x', { campusId: 'c1', acquire: ['campus'] }, headers)),
        handlers.status(post('/x', { campusId: 'c1', held: [] }, headers)),
      ]) {
        const response = await call
        expect(response.status).toBe(400)
        expect(await bodyOf(response)).toMatchObject({ code: 'SESSION_REQUIRED' })
      }
    }
    for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled()
  })

  it('503 SAVE_V2_NOT_CONFIGURED when the repository cannot be built (missing env)', async () => {
    const unconfigured = new Proxy(
      {},
      {
        get() {
          throw new Error('NAVI_STUDIO_DATABASE_URL is not set; Save v2 cannot reach its database.')
        },
      },
    ) as unknown as ReturnType<typeof fakeRepo>
    const { handlers } = setup(alice, unconfigured)
    const response = await handlers.save(post('/x', saveBody([])))
    expect(response.status).toBe(503)
    const body = await bodyOf(response)
    expect(body.code).toBe('SAVE_V2_NOT_CONFIGURED')
    expect(JSON.stringify(body)).not.toContain('Save v2 cannot reach')
    expect((await handlers.listCampuses(new Request('http://localhost/x'))).status).toBe(503)
  })
})

describe('save: op rules (R30)', () => {
  const smuggled = Buffer.from(
    JSON.stringify({ id: 'F1', planImageId: 'img', image: 'data:image/png;base64,AAAA' }),
  ).toString('base64')

  it.each([
    ['floor put-bin', { partKey: 'floor:B1:F1', expectedVersion: 0, op: 'put-bin', contentBase64: smuggled }],
    ['campus put-bin', { partKey: 'campus', expectedVersion: 0, op: 'put-bin', contentBase64: smuggled }],
    ['map item put-bin', { partKey: 'map/road:r1', expectedVersion: 0, op: 'put-bin', contentBase64: smuggled, sortKey: 'a0' }],
    ['terrain-tile put', { partKey: 'terrain-tile:t1', expectedVersion: 0, op: 'put', content: { a: 1 } }],
  ])('%s -> 400 INVALID_PART on /op, repository not called', async (_name, change) => {
    const { handlers, repo } = setup()
    const response = await handlers.save(post('/x', saveBody([change])))
    expect(response.status).toBe(400)
    const body = await bodyOf(response)
    expect(body.code).toBe('INVALID_PART')
    expect(body.details).toEqual([
      expect.objectContaining({ key: change.partKey, code: 'INVALID_PART', path: '/op' }),
    ])
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('terrain-tile put-bin passes through; deleting any part is unaffected', async () => {
    const { handlers, repo } = setup()
    repo.save.mockResolvedValue(okSave)
    const response = await handlers.save(
      post(
        '/x',
        saveBody([
          { partKey: 'terrain-tile:t1', expectedVersion: 0, op: 'put-bin', contentBase64: 'AAEC' },
          { partKey: 'floor:B1:F1', expectedVersion: 2, op: 'delete' },
        ]),
      ),
    )
    expect(response.status).toBe(200)
    expect(repo.save).toHaveBeenCalledTimes(1)
  })
})

describe('campus settings (R31)', () => {
  const dataUri = 'data:image/png;base64,iVBORw0KGgo='
  const cases: Array<[string, (h: ReturnType<typeof setup>['handlers'], settings: unknown) => Promise<Response>]> = [
    ['create', (h, settings) => h.createCampus(post('/x', { campusId: 'c1', name: 'n', settings }, {}))],
    ['update', (h, settings) => h.updateCampus(post('/x', { campusId: 'c1', settings }, {}))],
  ]

  describe.each(cases)('%s', (_name, call) => {
    it('a data: URI anywhere in settings -> 400 NOT_ALLOWED_IN_1_5', async () => {
      const { handlers, repo } = setup()
      const response = await call(handlers, { map: { imageUrl: dataUri } })
      expect(response.status).toBe(400)
      const body = await bodyOf(response)
      expect(body.code).toBe('NOT_ALLOWED_IN_1_5')
      expect(body.details).toEqual([expect.objectContaining({ code: 'NOT_ALLOWED_IN_1_5', path: '/map/imageUrl' })])
      expect(repo.createCampus).not.toHaveBeenCalled()
      expect(repo.updateCampusSettings).not.toHaveBeenCalled()
    })

    it('non-object settings -> 400 INVALID_REQUEST', async () => {
      const { handlers } = setup()
      for (const settings of [[], 'x', 5, null]) {
        const response = await call(handlers, settings)
        expect(response.status).toBe(400)
        expect((await bodyOf(response)).code).toBe('INVALID_REQUEST')
      }
    })

    it('oversize settings -> 400 TOO_LARGE', async () => {
      const { handlers, repo } = setup()
      const response = await call(handlers, { notes: 'x'.repeat(2_097_153) })
      expect(response.status).toBe(400)
      expect((await bodyOf(response)).code).toBe('TOO_LARGE')
      expect(repo.createCampus).not.toHaveBeenCalled()
      expect(repo.updateCampusSettings).not.toHaveBeenCalled()
    })

    it('normal settings (an https image URL) are accepted', async () => {
      const { handlers, repo } = setup()
      repo.createCampus.mockResolvedValue({ status: 'ok', campusId: 'c1' })
      repo.updateCampusSettings.mockResolvedValue({ status: 'ok' })
      const response = await call(handlers, { map: { imageUrl: 'https://example.org/map.png' }, theme: 'x' })
      expect([200, 201]).toContain(response.status)
    })
  })
})

describe('locks', () => {
  it('acquire -> 200 { granted, denied } with actor, display name and session', async () => {
    const { handlers, repo } = setup()
    const denied = [{ zoneKey: 'building:B1', holderName: 'ana', since: 't', sameActor: false }]
    repo.acquireZones.mockResolvedValue({ status: 'ok', granted: ['terrain'], denied })
    const response = await handlers.locks(post('/x', { campusId: 'c1', acquire: ['terrain', 'building:B1'] }))
    expect(response.status).toBe(200)
    expect(await bodyOf(response)).toEqual({ granted: ['terrain'], denied })
    expect(repo.acquireZones).toHaveBeenCalledWith('c1', 'user-alice', 'alice', SESSION, ['terrain', 'building:B1'])
  })

  it('release -> 200 { released }', async () => {
    const { handlers, repo } = setup()
    repo.releaseZones.mockResolvedValue({ status: 'ok', released: ['terrain'] })
    const response = await handlers.locks(post('/x', { campusId: 'c1', release: ['terrain'] }))
    expect(response.status).toBe(200)
    expect(await bodyOf(response)).toEqual({ released: ['terrain'] })
    expect(repo.releaseZones).toHaveBeenCalledWith('c1', 'user-alice', SESSION, ['terrain'])
  })

  it('forceRelease passes the super-admin flag and returns { released }', async () => {
    const { handlers, repo } = setup(root)
    repo.forceRelease.mockResolvedValue({ status: 'ok', released: true })
    const response = await handlers.locks(post('/x', { campusId: 'c1', forceRelease: 'building:B1' }))
    expect(response.status).toBe(200)
    expect(await bodyOf(response)).toEqual({ released: true })
    expect(repo.forceRelease).toHaveBeenCalledWith('c1', 'user-root', 'building:B1', true)

    const normal = setup(alice)
    normal.repo.forceRelease.mockResolvedValue({ status: 'forbidden' })
    const denied = await normal.handlers.locks(post('/x', { campusId: 'c1', forceRelease: 'building:B1' }))
    expect(denied.status).toBe(403)
    expect(normal.repo.forceRelease).toHaveBeenCalledWith('c1', 'user-alice', 'building:B1', false)
  })

  it('campus_not_found -> 404 and 22023 -> 400', async () => {
    const { handlers, repo } = setup()
    repo.acquireZones.mockResolvedValueOnce({ status: 'campus_not_found' })
    expect((await handlers.locks(post('/x', { campusId: 'c1', acquire: ['campus'] }))).status).toBe(404)
    repo.acquireZones.mockRejectedValueOnce(Object.assign(new Error('INVALID_ZONE: "x" is not a lock zone.'), { code: '22023' }))
    const bad = await handlers.locks(post('/x', { campusId: 'c1', acquire: ['x'] }))
    expect(bad.status).toBe(400)
    expect(await bodyOf(bad)).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('requires exactly one of acquire, release, forceRelease', async () => {
    const { handlers, repo } = setup()
    for (const body of [
      { campusId: 'c1' },
      { campusId: 'c1', acquire: ['campus'], release: ['campus'] },
      { campusId: 'c1', acquire: ['campus'], forceRelease: 'campus' },
      { campusId: 'c1', acquire: 'campus' },
      { campusId: 'c1', release: [1] },
      { campusId: 'c1', forceRelease: ['campus'] },
      { campusId: 'c1', forceRelease: '' },
    ]) {
      const response = await handlers.locks(post('/x', body))
      expect(response.status).toBe(400)
      expect((await bodyOf(response)).code).toBe('INVALID_REQUEST')
    }
    for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled()
  })

  it('uses the whole actor id as the display name when there is no email', async () => {
    const { handlers, repo } = setup({ id: 'mock-1', email: null, role: 'campus_admin', method: 'mock' })
    repo.acquireZones.mockResolvedValue({ status: 'ok', granted: [], denied: [] })
    await handlers.locks(post('/x', { campusId: 'c1', acquire: [] }))
    expect(repo.acquireZones).toHaveBeenCalledWith('c1', 'mock-1', 'mock-1', SESSION, [])
  })
})

describe('status', () => {
  const statusOk = { status: 'ok', headCommit: 7, locks: [], lostZones: ['terrain'] }

  it('returns headCommit, locks, lostZones and the role from roleOf', async () => {
    const { handlers, repo } = setup()
    repo.status.mockResolvedValue(statusOk)
    repo.roleOf.mockResolvedValue('editor')
    const response = await handlers.status(post('/x', { campusId: 'c1', held: ['terrain'] }))
    expect(response.status).toBe(200)
    expect(await bodyOf(response)).toEqual({ headCommit: 7, locks: [], lostZones: ['terrain'], myRole: 'editor' })
    expect(repo.status).toHaveBeenCalledWith('c1', 'user-alice', SESSION, ['terrain'])
    expect(repo.roleOf).toHaveBeenCalledWith('c1', 'user-alice')
  })

  it("a super admin's myRole is 'owner' without asking roleOf", async () => {
    const { handlers, repo } = setup(root)
    repo.status.mockResolvedValue(statusOk)
    const response = await handlers.status(post('/x', { campusId: 'c1', held: [] }))
    expect((await bodyOf(response)).myRole).toBe('owner')
    expect(repo.roleOf).not.toHaveBeenCalled()
  })

  it('404 when the campus is missing (status or role)', async () => {
    const { handlers, repo } = setup()
    repo.status.mockResolvedValueOnce({ status: 'campus_not_found' })
    expect((await handlers.status(post('/x', { campusId: 'c1', held: [] }))).status).toBe(404)
    repo.status.mockResolvedValueOnce(statusOk)
    repo.roleOf.mockResolvedValueOnce(null)
    expect((await handlers.status(post('/x', { campusId: 'c1', held: [] }))).status).toBe(404)
  })

  it('rejects a bad held list with 400', async () => {
    const { handlers } = setup()
    const response = await handlers.status(post('/x', { campusId: 'c1', held: 'terrain' }))
    expect(response.status).toBe(400)
  })
})

describe('campuses', () => {
  it('GET lists every campus', async () => {
    const { handlers, repo } = setup()
    repo.listCampuses.mockResolvedValue({ status: 'ok', campuses: [{ id: 'c1', name: 'One' }] })
    const response = await handlers.listCampuses(new Request('http://localhost/x'))
    expect(response.status).toBe(200)
    expect(await bodyOf(response)).toEqual({ campuses: [{ id: 'c1', name: 'One' }] })
  })

  it('POST creates -> 201 { campusId }, exists -> 409 CAMPUS_EXISTS', async () => {
    const { handlers, repo } = setup()
    repo.createCampus.mockResolvedValueOnce({ status: 'ok', campusId: 'c1' })
    const created = await handlers.createCampus(post('/x', { campusId: 'c1', name: 'One', settings: { a: 1 } }, {}))
    expect(created.status).toBe(201)
    expect(await bodyOf(created)).toEqual({ campusId: 'c1' })
    expect(repo.createCampus).toHaveBeenCalledWith('c1', 'One', 'user-alice', { a: 1 })
    repo.createCampus.mockResolvedValueOnce({ status: 'exists' })
    const again = await handlers.createCampus(post('/x', { campusId: 'c1', name: 'One' }, {}))
    expect(again.status).toBe(409)
    expect(await bodyOf(again)).toEqual({ code: 'CAMPUS_EXISTS' })
    expect(repo.createCampus).toHaveBeenLastCalledWith('c1', 'One', 'user-alice', {})
  })

  it('POST validates campusId and name', async () => {
    const { handlers, repo } = setup()
    for (const body of [
      { name: 'n' },
      { campusId: '', name: 'n' },
      { campusId: ' c', name: 'n' },
      { campusId: 'c\u0007', name: 'n' },
      { campusId: 'c'.repeat(257), name: 'n' },
      { campusId: 'c', name: '  ' },
      { campusId: 'c' },
      { campusId: 'c', name: 'n', settings: [] },
    ]) {
      const response = await handlers.createCampus(post('/x', body, {}))
      expect(response.status).toBe(400)
    }
    expect(repo.createCampus).not.toHaveBeenCalled()
  })

  it('PATCH updates settings: 200 | 403 | 404', async () => {
    const { handlers, repo } = setup()
    repo.updateCampusSettings.mockResolvedValueOnce({ status: 'ok' })
    expect((await handlers.updateCampus(post('/x', { campusId: 'c1', name: 'New', settings: { a: 1 } }, {}))).status).toBe(200)
    expect(repo.updateCampusSettings).toHaveBeenLastCalledWith('c1', 'user-alice', 'New', { a: 1 })
    repo.updateCampusSettings.mockResolvedValueOnce({ status: 'forbidden' })
    expect((await handlers.updateCampus(post('/x', { campusId: 'c1', settings: {} }, {}))).status).toBe(403)
    expect(repo.updateCampusSettings).toHaveBeenLastCalledWith('c1', 'user-alice', null, {})
    repo.updateCampusSettings.mockResolvedValueOnce({ status: 'campus_not_found' })
    expect((await handlers.updateCampus(post('/x', { campusId: 'c1', settings: {} }, {}))).status).toBe(404)
    expect((await handlers.updateCampus(post('/x', { campusId: 'c1' }, {}))).status).toBe(400)
  })

  it('DELETE ?campus_id= passes the super-admin flag: 200 | 403 | 404', async () => {
    const { handlers, repo } = setup(root)
    const del = (id: string | null) =>
      handlers.deleteCampus(new Request(`http://localhost/x${id === null ? '' : `?campus_id=${id}`}`, { method: 'DELETE' }))
    repo.deleteCampus.mockResolvedValueOnce({ status: 'ok' })
    expect((await del('c1')).status).toBe(200)
    expect(repo.deleteCampus).toHaveBeenLastCalledWith('c1', 'user-root', true)
    repo.deleteCampus.mockResolvedValueOnce({ status: 'forbidden' })
    expect((await del('c1')).status).toBe(403)
    repo.deleteCampus.mockResolvedValueOnce({ status: 'campus_not_found' })
    expect((await del('c1')).status).toBe(404)
    expect((await del(null)).status).toBe(400)
  })
})

describe('load and changes', () => {
  it('load -> 200 { headCommit, parts } | 404', async () => {
    const { handlers, repo } = setup()
    const parts = [{ partKey: 'campus', versionNo: 1, checksum: 'x', sortKey: null, content: {}, contentBase64: null }]
    repo.load.mockResolvedValueOnce({ status: 'ok', headCommit: 3, parts })
    const ok = await handlers.load(new Request('http://localhost/x'), { id: 'c1' })
    expect(ok.status).toBe(200)
    expect(await bodyOf(ok)).toEqual({ headCommit: 3, parts })
    repo.load.mockResolvedValueOnce({ status: 'campus_not_found' })
    expect((await handlers.load(new Request('http://localhost/x'), { id: 'c1' })).status).toBe(404)
  })

  it('changes -> 200 | 404, and a bad since -> 400', async () => {
    const { handlers, repo } = setup()
    repo.changesSince.mockResolvedValueOnce({ status: 'ok', headCommit: 9, parts: [] })
    const ok = await handlers.changes(new Request('http://localhost/x?since=4'), { id: 'c1' })
    expect(ok.status).toBe(200)
    expect(await bodyOf(ok)).toEqual({ headCommit: 9, parts: [] })
    expect(repo.changesSince).toHaveBeenCalledWith('c1', 4)
    repo.changesSince.mockResolvedValueOnce({ status: 'campus_not_found' })
    expect((await handlers.changes(new Request('http://localhost/x?since=0'), { id: 'c1' })).status).toBe(404)
    for (const query of ['', '?since=', '?since=-1', '?since=1.5', '?since=abc', '?since=1e3']) {
      const response = await handlers.changes(new Request(`http://localhost/x${query}`), { id: 'c1' })
      expect(response.status).toBe(400)
    }
  })
})
