// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { closeTestDb, withTestDb } from './test-harness'
import { createStudioHandlers } from '../server/handlers'
import { createStudioRepo } from '../server/studio-repo'

// The route handlers over the real repository and the real local database. Only the
// admin check is faked: each test names the principal that "signed in".

afterAll(async () => {
  await closeTestDb()
})

type Principal = { id: string; email: string | null; role: string; method: 'supabase' | 'mock' }
const alice: Principal = { id: 'alice-id', email: 'alice@example.org', role: 'campus_admin', method: 'supabase' }
const bob: Principal = { id: 'bob-id', email: 'bob@example.org', role: 'campus_admin', method: 'supabase' }

const SESSION_A = randomUUID()
const SESSION_B = randomUUID()

function handlersFor(client: Parameters<typeof createStudioRepo>[0], principal: Principal) {
  return createStudioHandlers({
    repo: createStudioRepo(client),
    verifyPrincipal: async () => ({ ok: true as const, principal }),
  })
}

function post(body: unknown, session?: string) {
  return new Request('http://localhost/api/studio/v2/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(session ? { 'x-navi-studio-session': session } : {}) },
    body: JSON.stringify(body),
  })
}

const get = (query = '') => new Request(`http://localhost/api/studio/v2/x${query}`)

const buildingContent = (id: string) => ({ building: { id }, floorOrder: [], qrCheckpoints: [], qrSortKeys: [] })
const floorContent = (id: string) => ({
  id,
  rooms: [],
  hallways: [],
  staircases: [],
  elevators: [],
  entrances: [],
  connectorStops: [],
  parametricComponents: [],
  metadata: {},
})

async function json(response: Response) {
  return (await response.json()) as Record<string, any>
}

describe('studio v2 routes over the real database', () => {
  it('two actors: A acquires building:B1, B save of floor:B1:F1 gives 423, B save of map/road gives 200', async () => {
    await withTestDb(async (client, admin) => {
      const campusId = `routes-${randomUUID().slice(0, 8)}`
      const a = handlersFor(client, alice)
      const b = handlersFor(client, bob)
      try {
        expect((await a.createCampus(post({ campusId, name: 'Routes' }))).status).toBe(201)

        const acquired = await a.locks(post({ campusId, acquire: ['building:B1'] }, SESSION_A))
        expect(acquired.status).toBe(200)
        expect(await json(acquired)).toEqual({ granted: ['building:B1'], denied: [] })

        const floorSave = await b.save(
          post(
            {
              campusId,
              mutationId: randomUUID(),
              baseCommit: 0,
              changes: [{ partKey: 'floor:B1:F1', expectedVersion: 0, op: 'put', content: floorContent('F1') }],
            },
            SESSION_B,
          ),
        )
        expect(floorSave.status).toBe(423)
        expect(await json(floorSave)).toEqual({
          code: 'ZONE_NOT_HELD',
          zones: [{ zoneKey: 'building:B1', holderName: 'alice' }],
        })

        const roadSave = await b.save(
          post(
            {
              campusId,
              mutationId: randomUUID(),
              baseCommit: 0,
              changes: [
                { partKey: 'map/road:r1', expectedVersion: 0, op: 'put', content: { id: 'r1', points: [] }, sortKey: 'a0' },
              ],
            },
            SESSION_B,
          ),
        )
        expect(roadSave.status).toBe(200)
        const saved = await json(roadSave)
        expect(saved.status).toBe('ok')
        expect(saved.commitNo).toBe(1)
        expect(saved.parts).toEqual([
          expect.objectContaining({ partKey: 'map/road:r1', versionNo: 1, checksum: expect.stringMatching(/^[0-9a-f]{64}$/) }),
        ])
      } finally {
        await admin.query('DELETE FROM studio.campuses WHERE id = $1', [campusId])
      }
    })
  })

  it('happy path: create, acquire, save, load, changes, status, release', async () => {
    await withTestDb(async (client, admin) => {
      const campusId = `happy-${randomUUID().slice(0, 8)}`
      const a = handlersFor(client, alice)
      try {
        const created = await a.createCampus(post({ campusId, name: 'Happy', settings: { theme: 'x' } }))
        expect(created.status).toBe(201)
        expect((await a.createCampus(post({ campusId, name: 'Happy' }))).status).toBe(409)

        const listed = await json(await a.listCampuses(get()))
        expect(listed.campuses.map((c: { id: string }) => c.id)).toContain(campusId)

        expect((await a.locks(post({ campusId, acquire: ['building:B1'] }, SESSION_A))).status).toBe(200)

        const mutationId = randomUUID()
        const body = {
          campusId,
          mutationId,
          baseCommit: 0,
          message: 'first',
          changes: [
            { partKey: 'building:B1', expectedVersion: 0, op: 'put', content: buildingContent('B1') },
            { partKey: 'floor:B1:F1', expectedVersion: 0, op: 'put', content: floorContent('F1') },
          ],
        }
        const first = await a.save(post(body, SESSION_A))
        expect(first.status).toBe(200)
        expect((await json(first)).commitNo).toBe(1)

        // A retry with the same mutationId replays the stored reply.
        const retry = await a.save(post(body, SESSION_A))
        expect(retry.status).toBe(200)
        expect((await json(retry)).status).toBe('replay')

        // The same mutationId with different content is a collision.
        const collision = await a.save(
          post({ ...body, changes: [{ partKey: 'floor:B1:F1', expectedVersion: 1, op: 'delete' }] }, SESSION_A),
        )
        expect(collision.status).toBe(409)
        expect(await json(collision)).toEqual({ code: 'MUTATION_ID_COLLISION' })

        // A stale expectedVersion is reported per part.
        const stale = await a.save(
          post(
            {
              campusId,
              mutationId: randomUUID(),
              baseCommit: 1,
              changes: [{ partKey: 'floor:B1:F1', expectedVersion: 0, op: 'put', content: floorContent('F1') }],
            },
            SESSION_A,
          ),
        )
        expect(stale.status).toBe(409)
        expect(await json(stale)).toMatchObject({
          code: 'STALE_PART',
          parts: [expect.objectContaining({ partKey: 'floor:B1:F1', yourVersion: 0, currentVersion: 1 })],
        })

        const loaded = await a.load(get(), { id: campusId })
        expect(loaded.status).toBe(200)
        const loadedBody = await json(loaded)
        expect(loadedBody.headCommit).toBe(1)
        expect(loadedBody.parts.map((p: { partKey: string }) => p.partKey).sort()).toEqual(['building:B1', 'floor:B1:F1'])

        const changed = await a.changes(get('?since=0'), { id: campusId })
        expect(changed.status).toBe(200)
        expect((await json(changed)).parts).toHaveLength(2)
        expect((await json(await a.changes(get('?since=1'), { id: campusId }))).parts).toEqual([])

        const status = await a.status(post({ campusId, held: ['building:B1'] }, SESSION_A))
        expect(status.status).toBe(200)
        const statusBody = await json(status)
        expect(statusBody).toMatchObject({ headCommit: 1, lostZones: [], myRole: 'owner' })
        expect(statusBody.locks).toEqual([expect.objectContaining({ zoneKey: 'building:B1', holderIsMe: true })])

        const released = await a.locks(post({ campusId, release: ['building:B1'] }, SESSION_A))
        expect(released.status).toBe(200)
        expect(await json(released)).toEqual({ released: ['building:B1'] })

        const settings = await a.updateCampus(post({ campusId, name: 'Happy 2', settings: { theme: 'y' } }))
        expect(settings.status).toBe(200)

        expect((await a.load(get(), { id: `missing-${campusId}` })).status).toBe(404)
        expect(
          (await a.save(post({ ...body, campusId: `missing-${campusId}`, mutationId: randomUUID() }, SESSION_A))).status,
        ).toBe(404)
      } finally {
        await admin.query('DELETE FROM studio.campuses WHERE id = $1', [campusId])
      }
    })
  })

  it('a viewer gets 403 on save and acquire; invalid zone gives 400; only the owner may delete', async () => {
    await withTestDb(async (client, admin) => {
      const campusId = `viewer-${randomUUID().slice(0, 8)}`
      const a = handlersFor(client, alice)
      const b = handlersFor(client, bob)
      try {
        expect((await a.createCampus(post({ campusId, name: 'Viewer' }))).status).toBe(201)
        await admin.query(
          `INSERT INTO studio.members (campus_id, user_id, display_name, role) VALUES ($1, $2, 'bob', 'viewer')`,
          [campusId, bob.id],
        )
        expect((await b.locks(post({ campusId, acquire: ['terrain'] }, SESSION_B))).status).toBe(403)
        const save = await b.save(
          post(
            {
              campusId,
              mutationId: randomUUID(),
              baseCommit: 0,
              changes: [
                { partKey: 'map/road:r1', expectedVersion: 0, op: 'put', content: { id: 'r1', points: [] }, sortKey: 'a0' },
              ],
            },
            SESSION_B,
          ),
        )
        expect(save.status).toBe(403)
        expect(await json(save)).toEqual({ code: 'FORBIDDEN' })

        const badZone = await a.locks(post({ campusId, acquire: ['not-a-zone'] }, SESSION_A))
        expect(badZone.status).toBe(400)
        expect((await json(badZone)).code).toBe('INVALID_REQUEST')

        const status = await b.status(post({ campusId, held: [] }, SESSION_B))
        expect((await json(status)).myRole).toBe('viewer')

        const del = (h: typeof a) =>
          h.deleteCampus(new Request(`http://localhost/x?campus_id=${campusId}`, { method: 'DELETE' }))
        expect((await del(b)).status).toBe(403)
        expect((await del(a)).status).toBe(200)
        expect((await del(a)).status).toBe(404)
      } finally {
        await admin.query('DELETE FROM studio.campuses WHERE id = $1', [campusId])
      }
    })
  })
})

