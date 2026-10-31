import { afterAll, describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { closeTestDb, withTestDb } from './test-harness'
import { createStudioRepo } from '../server/studio-repo'
import type { SaveChange, SaveInput } from '../server/types'

// Smoke test of every studio repository method against the real local database.
// The repo is built on `client` (navi_savev2_runner, a member of navi_studio_api),
// exactly as the server builds it on the pool.

afterAll(async () => {
  await closeTestDb()
})

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

function put(partKey: string, content: unknown, expectedVersion = 0, sortKey?: string): SaveChange {
  const text = JSON.stringify(content)
  return {
    partKey,
    op: 'put',
    expectedVersion,
    checksum: sha(text),
    content,
    sizeBytes: Buffer.byteLength(text),
    ...(sortKey === undefined ? {} : { sortKey }),
  }
}

function putBin(partKey: string, bytes: Buffer, expectedVersion = 0): SaveChange {
  return { partKey, op: 'put-bin', expectedVersion, checksum: sha(bytes), contentBase64: bytes.toString('base64') }
}

function saveInput(campusId: string, over: Partial<SaveInput> & Pick<SaveInput, 'changes'>): SaveInput {
  const mutationId = over.mutationId ?? randomUUID()
  return {
    campusId,
    actor: 'alice',
    session: 'alice-s1',
    mutationId,
    baseCommit: 0,
    message: 'smoke',
    requestChecksum: sha(`${mutationId}:${JSON.stringify(over.changes)}`),
    ...over,
  }
}

const ARTIFACTS = { 'campus.json': { url: 'x' } }
const PUB_SHA = sha('artifacts')

describe('createStudioRepo (every method against the local database)', () => {
  it('walks campus, locks, save, load, history and publications', async () => {
    await withTestDb(async (client, admin) => {
      const repo = createStudioRepo(client)
      const campus = `repo-${randomUUID().slice(0, 8)}`
      try {
        // createCampus / roleOf
        expect(await repo.createCampus(campus, 'Repo Campus', 'alice', { theme: 'x' })).toEqual({
          status: 'ok',
          campusId: campus,
        })
        expect(await repo.createCampus(campus, 'Again', 'alice', {})).toEqual({ status: 'exists' })
        expect(await repo.roleOf(campus, 'alice')).toBe('owner')
        expect(await repo.roleOf(campus, 'bob')).toBe('editor')
        expect(await repo.roleOf(`${campus}-missing`, 'alice')).toBeNull()
        await admin.query(
          `INSERT INTO studio.members (campus_id, user_id, display_name, role) VALUES ($1, 'vera', 'Vera', 'viewer')`,
          [campus],
        )
        expect(await repo.roleOf(campus, 'vera')).toBe('viewer')

        // acquireZones
        const acquired = await repo.acquireZones(campus, 'alice', 'Alice', 'alice-s1', ['building:b1'])
        expect(acquired).toEqual({ status: 'ok', granted: ['building:b1'], denied: [] })
        const contested = await repo.acquireZones(campus, 'bob', 'Bob', 'bob-s1', ['building:b1'])
        expect(contested).toMatchObject({
          status: 'ok',
          granted: [],
          denied: [{ zoneKey: 'building:b1', holderName: 'Alice', sameActor: false }],
        })
        expect(await repo.acquireZones(campus, 'vera', 'Vera', 'v-s1', ['building:b2'])).toEqual({ status: 'forbidden' })
        expect(await repo.acquireZones(`${campus}-missing`, 'alice', 'Alice', 's', ['terrain'])).toEqual({
          status: 'campus_not_found',
        })

        // save: ok, replay, collision, stale, zone_not_held, forbidden
        const first = saveInput(campus, {
          changes: [
            put('building:b1', { name: 'B1' }),
            put('map/poi:p1', { id: 'p1' }, 0, '000001'),
            putBin('map/poi:p2', Buffer.from([1, 2, 3, 250])),
          ],
        })
        const saved = await repo.save(first)
        expect(saved).toMatchObject({ status: 'ok', commitNo: 1 })
        if (saved.status !== 'ok') throw new Error('unreachable')
        expect(saved.parts).toEqual([
          { partKey: 'building:b1', versionNo: 1, checksum: sha(JSON.stringify({ name: 'B1' })) },
          { partKey: 'map/poi:p1', versionNo: 1, checksum: sha(JSON.stringify({ id: 'p1' })) },
          { partKey: 'map/poi:p2', versionNo: 1, checksum: sha(Buffer.from([1, 2, 3, 250])) },
        ])
        expect(saved.othersChanged).toEqual([])

        const replay = await repo.save(first)
        expect(replay).toMatchObject({ status: 'replay', commitNo: 1 })
        expect(await repo.save({ ...first, requestChecksum: sha('another request') })).toEqual({
          status: 'mutation_collision',
        })
        const stale = await repo.save(saveInput(campus, { changes: [put('building:b1', { name: 'B1 again' }, 0)] }))
        expect(stale).toMatchObject({
          status: 'stale',
          parts: [{ partKey: 'building:b1', yourVersion: 0, currentVersion: 1, savedBy: 'alice' }],
        })
        expect(
          await repo.save(saveInput(campus, { actor: 'bob', session: 'bob-s1', changes: [put('building:b1', { n: 2 }, 1)] })),
        ).toEqual({ status: 'zone_not_held', zones: [{ zoneKey: 'building:b1', holderName: 'Alice' }] })
        expect(
          await repo.save(saveInput(campus, { actor: 'vera', session: 'v-s1', changes: [put('map/poi:p9', {}, 0)] })),
        ).toEqual({ status: 'forbidden' })
        expect(await repo.save(saveInput(`${campus}-missing`, { changes: [] }))).toEqual({ status: 'campus_not_found' })

        // status
        const status = await repo.status(campus, 'alice', 'alice-s1', ['building:b1'])
        expect(status).toMatchObject({ status: 'ok', headCommit: 1, lostZones: [] })
        if (status.status !== 'ok') throw new Error('unreachable')
        expect(status.locks).toEqual([
          expect.objectContaining({ zoneKey: 'building:b1', holderName: 'Alice', holderIsMe: true }),
        ])
        expect(await repo.status(campus, 'bob', 'bob-s1', ['building:b1'])).toMatchObject({
          status: 'ok',
          lostZones: ['building:b1'],
        })

        // load: tombstone-free current parts; JSON as content, binary as contentBase64
        const loaded = await repo.load(campus)
        expect(loaded).toMatchObject({ status: 'ok', headCommit: 1 })
        if (loaded.status !== 'ok') throw new Error('unreachable')
        expect(loaded.parts.map((p) => p.partKey)).toEqual(['building:b1', 'map/poi:p1', 'map/poi:p2'])
        expect(loaded.parts[0]).toMatchObject({ versionNo: 1, content: { name: 'B1' }, contentBase64: null, sortKey: null })
        expect(loaded.parts[1]).toMatchObject({ sortKey: '000001' })
        expect(loaded.parts[2]).toMatchObject({ content: null, contentBase64: Buffer.from([1, 2, 3, 250]).toString('base64') })
        expect(await repo.load(`${campus}-missing`)).toEqual({ status: 'campus_not_found' })

        // second commit with a delete, then changesSince / partsAtCommit
        const second = await repo.save(
          saveInput(campus, {
            baseCommit: 1,
            changes: [put('building:b1', { name: 'B1 v2' }, 1), { partKey: 'map/poi:p1', op: 'delete', expectedVersion: 1 }],
          }),
        )
        expect(second).toMatchObject({ status: 'ok', commitNo: 2 })

        const changes = await repo.changesSince(campus, 1)
        expect(changes).toMatchObject({ status: 'ok', headCommit: 2 })
        if (changes.status !== 'ok') throw new Error('unreachable')
        expect(changes.parts.map((p) => [p.partKey, p.deleted, p.commitNo, p.author])).toEqual([
          ['building:b1', false, 2, 'alice'],
          ['map/poi:p1', true, 2, 'alice'],
        ])
        expect(await repo.changesSince(`${campus}-missing`, 0)).toEqual({ status: 'campus_not_found' })

        const at1 = await repo.partsAtCommit(campus, 1)
        expect(at1).toMatchObject({ status: 'ok', commitNo: 1 })
        if (at1.status !== 'ok') throw new Error('unreachable')
        expect(at1.parts.map((p) => p.partKey)).toEqual(['building:b1', 'map/poi:p1', 'map/poi:p2'])
        expect(at1.parts[0]).toMatchObject({ content: { name: 'B1' } })
        expect(await repo.partsAtCommit(campus, 99)).toEqual({ status: 'not_found' })

        // publications
        expect(await repo.currentPublication(campus)).toEqual({ status: 'ok', publication: null })
        expect(await repo.recordPublication(campus, 1, ARTIFACTS, PUB_SHA, 'bob', false)).toEqual({ status: 'forbidden' })
        expect(await repo.recordPublication(campus, 1, ARTIFACTS, PUB_SHA, 'alice', false)).toEqual({
          status: 'ok',
          publicationNo: 1,
        })
        expect(await repo.recordPublication(campus, 2, ARTIFACTS, PUB_SHA, 'bob', true)).toEqual({
          status: 'ok',
          publicationNo: 2,
        })
        const current = await repo.currentPublication(campus)
        expect(current).toMatchObject({
          status: 'ok',
          publication: { publicationNo: 2, sourceCommit: 2, campusName: 'Repo Campus', campusSettings: { theme: 'x' } },
        })
        if (current.status !== 'ok' || !current.publication) throw new Error('unreachable')
        expect(current.publication.artifacts).toEqual(ARTIFACTS)

        expect(await repo.rollbackPublication(campus, 1, 'alice', false)).toEqual({ status: 'ok', publicationNo: 1 })
        expect(await repo.rollbackPublication(campus, 99, 'alice', false)).toEqual({ status: 'not_found' })
        expect(await repo.rollbackPublication(campus, 2, 'bob', false)).toEqual({ status: 'forbidden' })
        expect(await repo.currentPublication(campus)).toMatchObject({ publication: { publicationNo: 1 } })

        // updateCampusSettings; the published list keeps the snapshot
        expect(await repo.updateCampusSettings(campus, 'vera', 'Nope', {})).toEqual({ status: 'forbidden' })
        expect(await repo.updateCampusSettings(campus, 'alice', 'Renamed', { theme: 'y' })).toEqual({ status: 'ok' })
        expect(await repo.updateCampusSettings(`${campus}-missing`, 'alice', null, {})).toEqual({
          status: 'campus_not_found',
        })

        const listed = await repo.listCampuses()
        expect(listed.status).toBe('ok')
        expect(listed.campuses.find((c) => c.id === campus)).toMatchObject({
          name: 'Renamed',
          settings: { theme: 'y' },
          headCommit: 2,
        })
        expect(listed.campuses.find((c) => c.id === campus)?.publishedAt).toEqual(expect.any(String))

        const published = await repo.publishedCampuses()
        expect(published.campuses.find((c) => c.id === campus)).toMatchObject({
          name: 'Repo Campus',
          settings: { theme: 'x' },
          publicationNo: 1,
        })

        // releaseZones / forceRelease
        expect(await repo.releaseZones(campus, 'alice', 'alice-s1', ['building:b1'])).toEqual({
          status: 'ok',
          released: ['building:b1'],
        })
        expect(await repo.releaseZones(campus, 'alice', 'alice-s1', ['building:b1'])).toEqual({ status: 'ok', released: [] })
        expect(await repo.acquireZones(campus, 'bob', 'Bob', 'bob-s1', ['terrain'])).toMatchObject({ granted: ['terrain'] })
        expect(await repo.forceRelease(campus, 'bob', 'terrain', false)).toEqual({ status: 'forbidden' })
        expect(await repo.forceRelease(campus, 'alice', 'terrain', false)).toEqual({ status: 'ok', released: true })
        expect(await repo.forceRelease(campus, 'alice', 'terrain', false)).toEqual({ status: 'ok', released: false })

        // deleteCampus
        expect(await repo.deleteCampus(campus, 'bob', false)).toEqual({ status: 'forbidden' })
        expect(await repo.deleteCampus(campus, 'alice', false)).toEqual({ status: 'ok' })
        expect(await repo.deleteCampus(campus, 'alice', false)).toEqual({ status: 'campus_not_found' })
      } finally {
        await admin.query('DELETE FROM studio.campuses WHERE id = $1', [campus])
      }
    })
  })

  it('lets database errors propagate: invalid input surfaces SQLSTATE 22023', async () => {
    await withTestDb(async (client, admin) => {
      const repo = createStudioRepo(client)
      const campus = `repo-bad-${randomUUID().slice(0, 8)}`
      try {
        await repo.createCampus(campus, 'Bad input', 'alice', {})
        await expect(
          repo.save(saveInput(campus, { changes: [{ partKey: 'not-a-part-key', op: 'delete', expectedVersion: 0 }] })),
        ).rejects.toMatchObject({ code: '22023', message: expect.stringContaining('INVALID_CHANGE:') })
        await expect(repo.acquireZones(campus, 'alice', 'Alice', 's1', ['floor:b1:f1'])).rejects.toMatchObject({
          code: '22023',
          message: expect.stringContaining('INVALID_ZONE:'),
        })
        await expect(repo.changesSince(campus, -1)).rejects.toMatchObject({
          code: '22023',
          message: expect.stringContaining('INVALID_ARGUMENT:'),
        })
      } finally {
        await admin.query('DELETE FROM studio.campuses WHERE id = $1', [campus])
      }
    })
  })

  it('has no prune method and role_of is a granted SECURITY DEFINER function', async () => {
    await withTestDb(async (client, admin) => {
      expect('prune' in createStudioRepo(client)).toBe(false)
      const { rows } = await admin.query<{ public_exec: boolean; api_exec: boolean; definer: boolean; volatility: string }>(
        `SELECT has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
                has_function_privilege('navi_studio_api', p.oid, 'EXECUTE') AS api_exec,
                p.prosecdef AS definer,
                p.provolatile AS volatility
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'studio' AND p.proname = 'role_of'`,
      )
      expect(rows).toEqual([{ public_exec: false, api_exec: true, definer: true, volatility: 's' }])
    })
  })
})
