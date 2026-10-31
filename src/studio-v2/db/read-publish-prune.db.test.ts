import { afterAll, describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { Client, type Queryable } from 'pg'
import { assertSaveV2TestTarget, saveV2ConnectionConfig } from '../../../scripts/save-v2/db-target.mjs'
import { closeTestDb, withTestDb, type TestDbClient } from './test-harness'

// Campus, load, changes-since, publication and prune functions. API functions are
// called through `client` (navi_savev2_runner, a member of navi_studio_api);
// studio.prune is not granted to the API role, so it runs through `admin`.
// The test database is shared by every test in this file: list assertions filter
// to the campus ids the test created.

afterAll(async () => {
  await closeTestDb()
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

const sha = (text: string | Buffer) => createHash('sha256').update(text).digest('hex')
const PUB_SHA = sha('artifacts')

type Change = Record<string, unknown>

function put(partKey: string, content: unknown, expectedVersion = 0, sortKey?: string): Change {
  const text = JSON.stringify(content)
  return {
    partKey,
    expectedVersion,
    op: 'put',
    checksum: sha(text),
    content,
    sizeBytes: Buffer.byteLength(text),
    ...(sortKey === undefined ? {} : { sortKey }),
  }
}

function putBin(partKey: string, bytes: Buffer, expectedVersion = 0): Change {
  return { partKey, expectedVersion, op: 'put-bin', checksum: sha(bytes), contentBase64: bytes.toString('base64') }
}

function del(partKey: string, expectedVersion: number): Change {
  return { partKey, expectedVersion, op: 'delete' }
}

let campusSeq = 0

async function newCampus(
  admin: TestDbClient,
  members: Array<[userId: string, role: 'owner' | 'editor' | 'viewer']> = [['alice', 'owner']],
  name = 'Test campus',
): Promise<string> {
  const id = `rpp-${++campusSeq}-${randomUUID().slice(0, 8)}`
  await admin.query(`INSERT INTO studio.campuses (id, name, created_by) VALUES ($1, $2, 'alice')`, [id, name])
  for (const [userId, role] of members) {
    await admin.query(
      `INSERT INTO studio.members (campus_id, user_id, display_name, role) VALUES ($1, $2, $2, $3)`,
      [id, userId, role],
    )
  }
  return id
}

/** One studio.save (map parts need no zone lock). Throws unless the save is ok. */
async function save(db: Queryable, campus: string, changes: Change[], actor = 'alice'): Promise<Json> {
  const changesJson = JSON.stringify(changes)
  const { rows } = await db.query(
    `SELECT studio.save($1, $2, 's1', $3, 0, 'test save', $4::jsonb, $5) AS r`,
    [campus, actor, randomUUID(), changesJson, sha(changesJson)],
  )
  const result: Json = rows[0].r
  if (result.status !== 'ok') throw new Error(`save failed: ${JSON.stringify(result)}`)
  return result
}

async function call(db: Queryable, fn: string, ...params: unknown[]): Promise<Json> {
  const placeholders = params.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await db.query(`SELECT studio.${fn}(${placeholders}) AS r`, params)
  return rows[0].r
}

const publish = (db: Queryable, campus: string, sourceCommit: number, actor = 'alice', superAdmin?: boolean) =>
  superAdmin === undefined
    ? call(db, 'record_publication', campus, sourceCommit, JSON.stringify({ commit: sourceCommit }), PUB_SHA, actor)
    : call(db, 'record_publication', campus, sourceCommit, JSON.stringify({ commit: sourceCommit }), PUB_SHA, actor, superAdmin)

const prune = (admin: TestDbClient, campus: string, dryRun: boolean, keep = 50) =>
  call(admin, 'prune', campus, dryRun, keep)

async function rowCounts(admin: TestDbClient, campus: string) {
  const { rows } = await admin.query(
    `SELECT (SELECT count(*) FROM studio.part_versions WHERE campus_id = $1)::int AS versions,
            (SELECT count(*) FROM studio.parts_current WHERE campus_id = $1)::int AS current,
            (SELECT count(*) FROM studio.commits WHERE campus_id = $1)::int AS commits,
            (SELECT count(*) FROM studio.publications WHERE campus_id = $1)::int AS publications,
            (SELECT count(*) FROM studio.published_current WHERE campus_id = $1)::int AS published_current,
            (SELECT count(*) FROM studio.milestones WHERE campus_id = $1)::int AS milestones,
            (SELECT count(*) FROM studio.mutation_receipts WHERE campus_id = $1)::int AS receipts,
            (SELECT pruned_floor_commit FROM studio.campuses WHERE id = $1)::int AS floor`,
    [campus],
  )
  return rows[0]
}

async function versionsOf(admin: TestDbClient, campus: string, partKey: string): Promise<number[]> {
  const { rows } = await admin.query(
    `SELECT version_no::int AS v FROM studio.part_versions WHERE campus_id = $1 AND part_key = $2 ORDER BY version_no`,
    [campus, partKey],
  )
  return rows.map((r) => r.v as number)
}

async function expectInvalidArgument(promise: Promise<unknown>): Promise<void> {
  const error = (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as { code?: string; message?: string } | null
  expect(error, 'should have raised').not.toBeNull()
  expect(error?.code).toBe('22023')
  expect(error?.message).toMatch(/^INVALID_ARGUMENT:/)
}

const strip = (parts: Json[]) =>
  parts.map(({ partKey, versionNo, checksum, sortKey, content, contentBase64 }: Json) => ({
    partKey,
    versionNo,
    checksum,
    sortKey,
    content,
    contentBase64,
  }))

describe('campuses', () => {
  it('create_campus makes the creator owner; an existing id returns exists', async () => {
    await withTestDb(async (client, admin) => {
      const id = `rpp-new-${randomUUID().slice(0, 8)}`
      const created = await call(client, 'create_campus', id, 'North', 'carol', JSON.stringify({ schoolName: 'S' }))
      expect(created).toEqual({ status: 'ok', campusId: id })
      const { rows } = await admin.query(
        `SELECT c.name, c.head_commit::int AS head, c.settings, c.created_by, m.user_id, m.role
           FROM studio.campuses c JOIN studio.members m ON m.campus_id = c.id WHERE c.id = $1`,
        [id],
      )
      expect(rows).toEqual([{ name: 'North', head: 0, settings: { schoolName: 'S' }, created_by: 'carol', user_id: 'carol', role: 'owner' }])

      expect(await call(client, 'create_campus', id, 'Other', 'dave', '{}')).toEqual({ status: 'exists' })
      await expectInvalidArgument(call(client, 'create_campus', `${id}-x`, 'X', 'carol', '[]'))
      await expectInvalidArgument(call(client, 'create_campus', '', 'X', 'carol', '{}'))
      await expectInvalidArgument(call(client, 'create_campus', `${id}-y`, ' ', 'carol', '{}'))
    })
  })

  it('list_campuses lists every campus ordered by name with headCommit and publishedAt', async () => {
    await withTestDb(async (client, admin) => {
      const b = await newCampus(admin, [['alice', 'owner']], 'Zeta')
      const a = await newCampus(admin, [['alice', 'owner']], 'Alpha')
      await save(client, b, [put('map/poi:p1', { id: 'p1' })])
      expect((await publish(client, b, 1)).status).toBe('ok')

      const listed = await call(client, 'list_campuses')
      expect(listed.status).toBe('ok')
      const mine = listed.campuses.filter((c: Json) => c.id === a || c.id === b)
      expect(mine.map((c: Json) => c.id)).toEqual([a, b])
      expect(mine[0]).toMatchObject({ id: a, name: 'Alpha', settings: {}, headCommit: 0, publishedAt: null })
      expect(mine[0].createdAt).toBeTruthy()
      expect(mine[1]).toMatchObject({ id: b, name: 'Zeta', headCommit: 1 })
      expect(mine[1].publishedAt).toBeTruthy()
    })
  })

  it('delete_campus by editor is forbidden; owner deletes and everything cascades', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'owner'], ['ed', 'editor']])
      await save(client, campus, [put('map/poi:p1', { id: 'p1' })])
      await publish(client, campus, 1)
      expect(await call(client, 'delete_campus', campus, 'ed')).toEqual({ status: 'forbidden' })
      expect(await call(client, 'delete_campus', campus, 'nobody')).toEqual({ status: 'forbidden' })
      expect((await rowCounts(admin, campus)).versions).toBe(1)

      expect(await call(client, 'delete_campus', campus, 'alice')).toEqual({ status: 'ok' })
      const { rows } = await admin.query(`SELECT count(*)::int AS n FROM studio.campuses WHERE id = $1`, [campus])
      expect(rows[0].n).toBe(0)
      expect(await rowCounts(admin, campus)).toMatchObject({
        versions: 0,
        current: 0,
        commits: 0,
        publications: 0,
        published_current: 0,
        receipts: 0,
      })
      expect(await call(client, 'delete_campus', campus, 'alice')).toEqual({ status: 'campus_not_found' })
    })
  })

  it('delete_campus by a super admin is allowed', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['ed', 'editor']])
      expect(await call(client, 'delete_campus', campus, 'ed', true)).toEqual({ status: 'ok' })
    })
  })

  it('update_campus_settings: viewer forbidden, editor and non-member allowed, NULL name keeps the name', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'owner'], ['ed', 'editor'], ['vic', 'viewer']])
      expect(await call(client, 'update_campus_settings', campus, 'vic', 'New', '{}')).toEqual({ status: 'forbidden' })
      expect(await call(client, 'update_campus_settings', campus, 'ed', 'Renamed', JSON.stringify({ a: 1 }))).toEqual({
        status: 'ok',
      })
      expect(await call(client, 'update_campus_settings', campus, 'stranger', null, JSON.stringify({ b: 2 }))).toEqual({
        status: 'ok',
      })
      const { rows } = await admin.query(`SELECT name, settings FROM studio.campuses WHERE id = $1`, [campus])
      expect(rows[0]).toEqual({ name: 'Renamed', settings: { b: 2 } })
      await expectInvalidArgument(call(client, 'update_campus_settings', campus, 'ed', null, '"x"'))
      await expectInvalidArgument(call(client, 'update_campus_settings', campus, 'ed', null, null))
      expect(await call(client, 'update_campus_settings', 'missing-campus', 'ed', null, '{}')).toEqual({
        status: 'campus_not_found',
      })
    })
  })
})

describe('load, changes_since and parts_at_commit', () => {
  it('load returns current parts only', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      const bytes = Buffer.from([0, 1, 2, 250, 255])
      await save(client, campus, [put('map/poi:b', { id: 'b', v: 1 }, 0, 'k2'), put('map/poi:a', { id: 'a' })])
      await save(client, campus, [put('map/poi:b', { id: 'b', v: 2 }, 1, 'k3'), put('map/road:gone', { id: 'gone' })])
      await save(client, campus, [del('map/road:gone', 1), putBin('map/area:bin', bytes)])

      const loaded = await call(client, 'load', campus)
      expect(loaded).toEqual({
        status: 'ok',
        headCommit: 3,
        parts: [
          { partKey: 'map/area:bin', versionNo: 1, checksum: sha(bytes), sortKey: null, content: null, contentBase64: bytes.toString('base64') },
          { partKey: 'map/poi:a', versionNo: 1, checksum: sha(JSON.stringify({ id: 'a' })), sortKey: null, content: { id: 'a' }, contentBase64: null },
          { partKey: 'map/poi:b', versionNo: 2, checksum: sha(JSON.stringify({ id: 'b', v: 2 })), sortKey: 'k3', content: { id: 'b', v: 2 }, contentBase64: null },
        ],
      })
      expect(await call(client, 'load', 'missing-campus')).toEqual({ status: 'campus_not_found' })
      expect(await call(client, 'load', await newCampus(admin))).toEqual({ status: 'ok', headCommit: 0, parts: [] })
    })
  })

  it('changes_since 0 equals load', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, campus, [put('map/poi:a', { id: 'a' }), putBin('map/area:x', Buffer.from('xyz'))])
      await save(client, campus, [put('map/poi:a', { id: 'a', v: 2 }, 1)], 'bob')
      const loaded = await call(client, 'load', campus)
      const changes = await call(client, 'changes_since', campus, 0)
      expect(changes.status).toBe('ok')
      expect(changes.headCommit).toBe(2)
      expect(strip(changes.parts)).toEqual(loaded.parts)
      expect(changes.parts.map((p: Json) => [p.partKey, p.deleted, p.commitNo, p.author])).toEqual([
        ['map/area:x', false, 1, 'alice'],
        ['map/poi:a', false, 2, 'bob'],
      ])
    })
  })

  it('changes_since reports tombstones that load omits, and only parts changed after p_since', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, campus, [put('map/poi:a', { id: 'a' }), put('map/poi:b', { id: 'b' })])
      await save(client, campus, [del('map/poi:b', 1)], 'bob')
      const loaded = await call(client, 'load', campus)
      expect(loaded.parts.map((p: Json) => p.partKey)).toEqual(['map/poi:a'])

      const changes = await call(client, 'changes_since', campus, 1)
      expect(changes).toEqual({
        status: 'ok',
        headCommit: 2,
        parts: [
          {
            partKey: 'map/poi:b',
            versionNo: 2,
            checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            sortKey: null,
            content: null,
            contentBase64: null,
            deleted: true,
            commitNo: 2,
            author: 'bob',
          },
        ],
      })
      expect((await call(client, 'changes_since', campus, 2)).parts).toEqual([])
      await expectInvalidArgument(call(client, 'changes_since', campus, -1))
      expect(await call(client, 'changes_since', 'missing-campus', 0)).toEqual({ status: 'campus_not_found' })
    })
  })

  it('parts_at_commit 3 returns the versions as of commit 3', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, campus, [put('map/poi:a', { a: 1 }), put('map/poi:b', { b: 1 })]) // 1
      await save(client, campus, [put('map/poi:a', { a: 2 }, 1)]) // 2
      await save(client, campus, [put('map/poi:c', { c: 1 }), del('map/poi:b', 1)]) // 3
      await save(client, campus, [put('map/poi:a', { a: 3 }, 2)]) // 4

      const at3 = await call(client, 'parts_at_commit', campus, 3)
      expect(at3.status).toBe('ok')
      expect(at3.commitNo).toBe(3)
      expect(at3.parts.map((p: Json) => [p.partKey, p.versionNo, p.content])).toEqual([
        ['map/poi:a', 2, { a: 2 }],
        ['map/poi:c', 1, { c: 1 }],
      ])
      const at1 = await call(client, 'parts_at_commit', campus, 1)
      expect(at1.parts.map((p: Json) => [p.partKey, p.versionNo])).toEqual([
        ['map/poi:a', 1],
        ['map/poi:b', 1],
      ])
      expect(await call(client, 'parts_at_commit', campus, 0)).toEqual({ status: 'ok', commitNo: 0, parts: [] })
      expect(strip((await call(client, 'parts_at_commit', campus, 4)).parts)).toEqual((await call(client, 'load', campus)).parts)
      expect(await call(client, 'parts_at_commit', campus, 5)).toEqual({ status: 'not_found' })
      expect(await call(client, 'parts_at_commit', campus, -1)).toEqual({ status: 'not_found' })
      expect(await call(client, 'parts_at_commit', 'missing-campus', 1)).toEqual({ status: 'campus_not_found' })
    })
  })
})

describe('publications', () => {
  it('record_publication moves current pointer atomically', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, campus, [put('map/poi:a', { a: 1 })])
      await save(client, campus, [put('map/poi:a', { a: 2 }, 1)])

      expect(await publish(client, campus, 1)).toEqual({ status: 'ok', publicationNo: 1 })
      const first = await call(client, 'current_publication', campus)
      expect(first).toMatchObject({ status: 'ok', publication: { publicationNo: 1, sourceCommit: 1, artifacts: { commit: 1 } } })
      expect(first.publication.publishedAt).toBeTruthy()

      expect(await publish(client, campus, 2)).toEqual({ status: 'ok', publicationNo: 2 })
      expect((await call(client, 'current_publication', campus)).publication).toMatchObject({ publicationNo: 2, sourceCommit: 2 })
      const { rows } = await admin.query(
        `SELECT publication_no::int AS n, status, published_by FROM studio.publications WHERE campus_id = $1 ORDER BY 1`,
        [campus],
      )
      expect(rows).toEqual([
        { n: 1, status: 'published', published_by: 'alice' },
        { n: 2, status: 'published', published_by: 'alice' },
      ])

      // A failing call leaves the pointer and the publication rows untouched.
      await expectInvalidArgument(publish(client, campus, 3))
      await expectInvalidArgument(publish(client, campus, 0))
      await expectInvalidArgument(call(client, 'record_publication', campus, 2, '{}', 'ABC', 'alice'))
      await expectInvalidArgument(call(client, 'record_publication', campus, 2, '[]', PUB_SHA, 'alice'))
      expect((await rowCounts(admin, campus)).publications).toBe(2)
      expect((await call(client, 'current_publication', campus)).publication.publicationNo).toBe(2)
      expect(await publish(client, 'missing-campus', 1)).toEqual({ status: 'campus_not_found' })
    })
  })

  it('rollback restores the previous publication', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, campus, [put('map/poi:a', { a: 1 })])
      await save(client, campus, [put('map/poi:a', { a: 2 }, 1)])
      await publish(client, campus, 1)
      await publish(client, campus, 2)
      expect(await call(client, 'rollback_publication', campus, 1, 'alice')).toEqual({ status: 'ok', publicationNo: 1 })
      expect((await call(client, 'current_publication', campus)).publication).toMatchObject({
        publicationNo: 1,
        sourceCommit: 1,
        artifacts: { commit: 1 },
      })
      expect(await call(client, 'rollback_publication', campus, 9, 'alice')).toEqual({ status: 'not_found' })
      expect((await call(client, 'current_publication', campus)).publication.publicationNo).toBe(1)
    })
  })

  it('editors are forbidden to publish, roll back or delete; the super-admin flag is allowed', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'owner'], ['ed', 'editor'], ['vic', 'viewer']])
      await save(client, campus, [put('map/poi:a', { a: 1 })])
      expect(await publish(client, campus, 1, 'ed')).toEqual({ status: 'forbidden' })
      expect(await publish(client, campus, 1, 'vic')).toEqual({ status: 'forbidden' })
      expect(await publish(client, campus, 1, 'stranger')).toEqual({ status: 'forbidden' })
      expect((await rowCounts(admin, campus)).publications).toBe(0)

      expect(await publish(client, campus, 1, 'ed', true)).toEqual({ status: 'ok', publicationNo: 1 })
      expect(await publish(client, campus, 1, 'alice')).toEqual({ status: 'ok', publicationNo: 2 })
      expect(await call(client, 'rollback_publication', campus, 1, 'ed')).toEqual({ status: 'forbidden' })
      expect((await call(client, 'current_publication', campus)).publication.publicationNo).toBe(2)
      expect(await call(client, 'rollback_publication', campus, 1, 'ed', true)).toEqual({ status: 'ok', publicationNo: 1 })
      expect(await call(client, 'delete_campus', campus, 'ed')).toEqual({ status: 'forbidden' })
      expect(await call(client, 'delete_campus', campus, 'ed', true)).toEqual({ status: 'ok' })
    })
  })

  it('current_publication null when never published', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      expect(await call(client, 'current_publication', campus)).toEqual({ status: 'ok', publication: null })
      expect(await call(client, 'current_publication', 'missing-campus')).toEqual({ status: 'campus_not_found' })
    })
  })

  it('published_campuses lists only campuses with a current publication', async () => {
    await withTestDb(async (client, admin) => {
      const draft = await newCampus(admin, [['alice', 'owner']], 'Draft only')
      const live = await newCampus(admin, [['alice', 'owner']], 'Live')
      await call(client, 'update_campus_settings', live, 'alice', null, JSON.stringify({ schoolName: 'Live school' }))
      await save(client, draft, [put('map/poi:a', { a: 1 })])
      await save(client, live, [put('map/poi:a', { a: 1 })])
      await publish(client, live, 1)

      const listed = await call(client, 'published_campuses')
      expect(listed.status).toBe('ok')
      const ids = listed.campuses.map((c: Json) => c.id)
      expect(ids).toContain(live)
      expect(ids).not.toContain(draft)
      const entry = listed.campuses.find((c: Json) => c.id === live)
      expect(entry).toMatchObject({ id: live, name: 'Live', settings: { schoolName: 'Live school' }, publicationNo: 1 })
      expect(entry.publishedAt).toBeTruthy()
      expect(Object.keys(entry).sort()).toEqual(['id', 'name', 'publicationNo', 'publishedAt', 'settings'])
    })
  })

  it('published name and settings are a snapshot: settings edits show only after the next publication (R22)', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'owner']], 'Before')
      await call(client, 'update_campus_settings', campus, 'alice', null, JSON.stringify({ schoolName: 'Old' }))
      await save(client, campus, [put('map/poi:a', { a: 1 })])
      await publish(client, campus, 1)
      const entryOf = async () =>
        (await call(client, 'published_campuses')).campuses.find((c: Json) => c.id === campus)

      expect(await entryOf()).toMatchObject({ name: 'Before', settings: { schoolName: 'Old' }, publicationNo: 1 })
      expect((await call(client, 'current_publication', campus)).publication).toMatchObject({
        publicationNo: 1,
        campusName: 'Before',
        campusSettings: { schoolName: 'Old' },
      })

      // An unpublished edit: Studio sees it, NAVI Web does not.
      expect(await call(client, 'update_campus_settings', campus, 'alice', 'After', JSON.stringify({ schoolName: 'New' }))).toEqual({
        status: 'ok',
      })
      const studioView = (await call(client, 'list_campuses')).campuses.find((c: Json) => c.id === campus)
      expect(studioView).toMatchObject({ name: 'After', settings: { schoolName: 'New' } })
      expect(await entryOf()).toMatchObject({ name: 'Before', settings: { schoolName: 'Old' }, publicationNo: 1 })
      expect((await call(client, 'current_publication', campus)).publication).toMatchObject({
        campusName: 'Before',
        campusSettings: { schoolName: 'Old' },
      })

      // The next publication carries the edit.
      await publish(client, campus, 1)
      expect(await entryOf()).toMatchObject({ name: 'After', settings: { schoolName: 'New' }, publicationNo: 2 })
      expect((await call(client, 'current_publication', campus)).publication).toMatchObject({
        publicationNo: 2,
        campusName: 'After',
        campusSettings: { schoolName: 'New' },
      })

      // Rolling back serves the older snapshot again.
      await call(client, 'rollback_publication', campus, 1, 'alice')
      expect(await entryOf()).toMatchObject({ name: 'Before', settings: { schoolName: 'Old' }, publicationNo: 1 })
    })
  })

  it('record_publication refuses a pruned, unprotected source commit and writes nothing (R23)', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, campus, [put('map/poi:a', { v: 1 }), put('map/poi:b', { v: 1 })]) // 1
      for (let v = 2; v <= 5; v++) await save(client, campus, [put('map/poi:a', { v }, v - 1)]) // 2..5
      expect(await publish(client, campus, 5)).toEqual({ status: 'ok', publicationNo: 1 })
      await prune(admin, campus, false, 1)
      expect((await rowCounts(admin, campus)).floor).toBe(4)
      expect(await call(client, 'parts_at_commit', campus, 2)).toEqual({ status: 'pruned' })

      expect(await publish(client, campus, 2)).toEqual({ status: 'pruned' })
      expect(await rowCounts(admin, campus)).toMatchObject({ publications: 1, published_current: 1 })
      expect((await call(client, 'current_publication', campus)).publication).toMatchObject({ publicationNo: 1, sourceCommit: 5 })
      expect(await call(client, 'parts_at_commit', campus, 2)).toEqual({ status: 'pruned' })
    })
  })

  it('record_publication accepts a source commit at or below the floor that is still protected (R23)', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, campus, [put('map/poi:a', { v: 1 }), put('map/poi:b', { v: 1 })]) // 1
      for (let v = 2; v <= 5; v++) await save(client, campus, [put('map/poi:a', { v }, v - 1)]) // 2..5
      await publish(client, campus, 3) // #1 protects commit 3
      await publish(client, campus, 5) // #2
      await prune(admin, campus, false, 1)
      expect((await rowCounts(admin, campus)).floor).toBe(4)

      expect(await publish(client, campus, 3)).toEqual({ status: 'ok', publicationNo: 3 })
      expect((await call(client, 'current_publication', campus)).publication).toMatchObject({ publicationNo: 3, sourceCommit: 3 })
      expect((await call(client, 'parts_at_commit', campus, 3)).parts.map((p: Json) => [p.partKey, p.versionNo])).toEqual([
        ['map/poi:a', 3],
        ['map/poi:b', 1],
      ])
    })
  })

  it('record_publication and studio.save on the same campus serialize on the campus row', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, campus, [put('map/poi:a', { a: 1 })])
      const holder = new Client(saveV2ConnectionConfig())
      await holder.connect()
      try {
        await assertSaveV2TestTarget(holder)
        await client.query(`SET statement_timeout = '10s'`)
        const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        const clientPid = rows[0].pid

        await holder.query('BEGIN')
        expect((await save(holder, campus, [put('map/poi:a', { a: 2 }, 1)], 'bob')).commitNo).toBe(2)

        // Commit 2 is not visible yet: publishing it can only succeed after waiting for the save.
        const pending = publish(client, campus, 2)
        pending.catch(() => undefined) // surfaced by the await below, not as an unhandled rejection
        let waiting = false
        for (let i = 0; i < 100 && !waiting; i++) {
          const activity = await admin.query(`SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1`, [clientPid])
          waiting = activity.rows[0]?.wait_event_type === 'Lock'
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50))
        }
        expect(waiting).toBe(true)

        await holder.query('COMMIT')
        expect(await pending).toEqual({ status: 'ok', publicationNo: 1 })
        expect((await call(client, 'current_publication', campus)).publication.sourceCommit).toBe(2)
      } finally {
        await holder.query('ROLLBACK').catch(() => undefined)
        await holder.end()
        await client.query('RESET statement_timeout')
      }
    })
  })
})

describe('studio.prune', () => {
  async function milestone(admin: TestDbClient, campus: string, commitNo: number) {
    await admin.query(
      `INSERT INTO studio.milestones (campus_id, commit_no, label, created_by) VALUES ($1, $2, 'm', 'alice')`,
      [campus, commitNo],
    )
  }

  it('prune dry run never deletes and keeps published and milestone versions', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      // map/poi:a versions 1..8 at commits 1..8.
      await save(client, campus, [put('map/poi:a', { v: 1 })])
      for (let v = 2; v <= 8; v++) await save(client, campus, [put('map/poi:a', { v }, v - 1)])
      await publish(client, campus, 3)
      await milestone(admin, campus, 5)
      await admin.query(
        `UPDATE studio.mutation_receipts SET created_at = now() - interval '8 days'
          WHERE campus_id = $1 AND mutation_id IN (SELECT mutation_id FROM studio.commits WHERE campus_id = $1 AND commit_no <= 2)`,
        [campus],
      )
      const before = await rowCounts(admin, campus)

      const dry = await prune(admin, campus, true, 2)
      expect(dry).toEqual({
        status: 'ok',
        dryRun: true,
        wouldDelete: { partVersions: 4, publications: 0, receipts: 2 },
        partVersions: [1, 2, 4, 6].map((versionNo) => ({ partKey: 'map/poi:a', versionNo })),
      })
      expect(await rowCounts(admin, campus)).toEqual(before)
      expect(await versionsOf(admin, campus, 'map/poi:a')).toEqual([1, 2, 3, 4, 5, 6, 7, 8])

      // The default is a dry run.
      expect((await call(admin, 'prune', campus)).dryRun).toBe(true)
      expect(await rowCounts(admin, campus)).toEqual(before)

      const real = await prune(admin, campus, false, 2)
      expect(real).toMatchObject({ status: 'ok', dryRun: false, wouldDelete: { partVersions: 4, publications: 0, receipts: 2 } })
      expect(await versionsOf(admin, campus, 'map/poi:a')).toEqual([3, 5, 7, 8])
      expect(await rowCounts(admin, campus)).toMatchObject({ commits: 8, receipts: 6, publications: 1, floor: 6 })
      expect((await call(client, 'parts_at_commit', campus, 3)).parts.map((p: Json) => p.versionNo)).toEqual([3])
      expect((await call(client, 'parts_at_commit', campus, 5)).parts.map((p: Json) => p.versionNo)).toEqual([5])
      expect(await call(client, 'parts_at_commit', campus, 4)).toEqual({ status: 'pruned' })
      expect(await call(client, 'parts_at_commit', campus, 6)).toEqual({ status: 'pruned' })
      expect((await call(client, 'parts_at_commit', campus, 7)).status).toBe('ok')

      await expectInvalidArgument(prune(admin, campus, true, 0))
      expect(await prune(admin, 'missing-campus', true)).toEqual({ status: 'campus_not_found' })
    })
  })

  it('keeps every part version effective at a published commit (R20)', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, campus, [put('map/poi:A', { a: 1 })]) // commit 1
      for (let v = 1; v <= 59; v++) await save(client, campus, [put('map/poi:B', { b: v }, v - 1)]) // commits 2..60
      expect(await publish(client, campus, 5)).toEqual({ status: 'ok', publicationNo: 1 })
      const at5Before = await call(client, 'parts_at_commit', campus, 5)
      expect(at5Before.parts.map((p: Json) => [p.partKey, p.versionNo])).toEqual([
        ['map/poi:A', 1],
        ['map/poi:B', 4],
      ])

      const dry = await prune(admin, campus, true, 50)
      expect(dry.wouldDelete.partVersions).toBe(8)
      const real = await prune(admin, campus, false, 50)
      expect(real.wouldDelete).toEqual({ partVersions: 8, publications: 0, receipts: 0 })
      expect(real.partVersions).toEqual([1, 2, 3, 5, 6, 7, 8, 9].map((versionNo) => ({ partKey: 'map/poi:B', versionNo })))

      expect(await versionsOf(admin, campus, 'map/poi:A')).toEqual([1])
      const expectedB = [4, ...Array.from({ length: 50 }, (_, i) => i + 10)]
      expect(await versionsOf(admin, campus, 'map/poi:B')).toEqual(expectedB)
      // B v9 (commit 10) was deleted; its successor v10 is at commit 11.
      expect((await rowCounts(admin, campus)).floor).toBe(10)

      expect(await call(client, 'parts_at_commit', campus, 5)).toEqual(at5Before)
      expect(await call(client, 'parts_at_commit', campus, 7)).toEqual({ status: 'pruned' })
      expect(await call(client, 'parts_at_commit', campus, 10)).toEqual({ status: 'pruned' })
      expect((await call(client, 'parts_at_commit', campus, 11)).parts.map((p: Json) => [p.partKey, p.versionNo])).toEqual([
        ['map/poi:A', 1],
        ['map/poi:B', 10],
      ])
      const head = await call(client, 'parts_at_commit', campus, 60)
      expect(head.status).toBe('ok')
      expect(strip(head.parts)).toEqual((await call(client, 'load', campus)).parts)

      // A second prune finds nothing more to delete and keeps the floor.
      expect((await prune(admin, campus, false, 50)).wouldDelete).toEqual({ partVersions: 0, publications: 0, receipts: 0 })
      expect((await rowCounts(admin, campus)).floor).toBe(10)
    })
  })

  it('keeps a version saved before the published commit that is still effective there (R20)', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, campus, [put('map/poi:x', { v: 1 })]) // 1: x1
      await save(client, campus, [put('map/poi:y', { v: 1 })]) // 2: y1
      await save(client, campus, [put('map/poi:x', { v: 2 }, 1)]) // 3: x2
      await publish(client, campus, 2)
      const at2 = await call(client, 'parts_at_commit', campus, 2)

      const real = await prune(admin, campus, false, 1)
      expect(real.wouldDelete.partVersions).toBe(0)
      expect(await versionsOf(admin, campus, 'map/poi:x')).toEqual([1, 2])
      expect(await call(client, 'parts_at_commit', campus, 2)).toEqual(at2)
      expect(at2.parts.map((p: Json) => [p.partKey, p.versionNo])).toEqual([
        ['map/poi:x', 1],
        ['map/poi:y', 1],
      ])
    })
  })

  it('keeps an effective tombstone and the current tombstone', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, campus, [put('map/poi:x', { v: 1 }), put('map/poi:y', { v: 1 })]) // 1: x1 y1
      await save(client, campus, [del('map/poi:x', 1)]) // 2: x2 tombstone
      await save(client, campus, [put('map/poi:x', { v: 3 }, 2)]) // 3: x3
      await save(client, campus, [put('map/poi:x', { v: 4 }, 3), del('map/poi:y', 1)]) // 4: x4, y2 tombstone (current)
      await save(client, campus, [put('map/poi:x', { v: 5 }, 4)]) // 5: x5
      await milestone(admin, campus, 2)

      await prune(admin, campus, false, 1)
      expect(await versionsOf(admin, campus, 'map/poi:x')).toEqual([2, 5])
      expect(await versionsOf(admin, campus, 'map/poi:y')).toEqual([1, 2])
      expect((await call(client, 'parts_at_commit', campus, 2)).parts.map((p: Json) => [p.partKey, p.versionNo])).toEqual([
        ['map/poi:y', 1],
      ])
      expect((await call(client, 'changes_since', campus, 0)).parts.map((p: Json) => [p.partKey, p.deleted])).toEqual([
        ['map/poi:x', false],
        ['map/poi:y', true],
      ])
    })
  })

  it('keeps the current publication and the newest 10; deletes the rest', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, campus, [put('map/poi:a', { a: 1 })])
      for (let i = 1; i <= 12; i++) expect((await publish(client, campus, 1)).publicationNo).toBe(i)
      expect(await call(client, 'rollback_publication', campus, 1, 'alice')).toEqual({ status: 'ok', publicationNo: 1 })

      const dry = await prune(admin, campus, true)
      expect(dry.wouldDelete.publications).toBe(1)
      expect((await rowCounts(admin, campus)).publications).toBe(12)

      expect((await prune(admin, campus, false)).wouldDelete.publications).toBe(1)
      const { rows } = await admin.query(
        `SELECT publication_no::int AS n FROM studio.publications WHERE campus_id = $1 ORDER BY 1`,
        [campus],
      )
      expect(rows.map((r) => r.n)).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
      expect((await call(client, 'current_publication', campus)).publication.publicationNo).toBe(1)
    })
  })

  it('keeps a publication whose source commit is a milestone', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, campus, [put('map/poi:a', { a: 1 })])
      await save(client, campus, [put('map/poi:a', { a: 2 }, 1)])
      await publish(client, campus, 2) // #1, milestone commit
      for (let i = 0; i < 11; i++) await publish(client, campus, 1) // #2..#12
      await milestone(admin, campus, 2)
      await prune(admin, campus, false)
      const { rows } = await admin.query(
        `SELECT publication_no::int AS n FROM studio.publications WHERE campus_id = $1 ORDER BY 1`,
        [campus],
      )
      expect(rows.map((r) => r.n)).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    })
  })

  it('deletes receipts older than 7 days and keeps newer ones', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, campus, [put('map/poi:a', { a: 1 })])
      await save(client, campus, [put('map/poi:b', { b: 1 })])
      await save(client, campus, [put('map/poi:c', { c: 1 })])
      await admin.query(
        `UPDATE studio.mutation_receipts SET created_at = now() - interval '8 days'
          WHERE campus_id = $1 AND mutation_id = (SELECT mutation_id FROM studio.commits WHERE campus_id = $1 AND commit_no = 1)`,
        [campus],
      )
      await admin.query(
        `UPDATE studio.mutation_receipts SET created_at = now() - interval '6 days'
          WHERE campus_id = $1 AND mutation_id = (SELECT mutation_id FROM studio.commits WHERE campus_id = $1 AND commit_no = 2)`,
        [campus],
      )
      expect((await prune(admin, campus, false)).wouldDelete).toEqual({ partVersions: 0, publications: 0, receipts: 1 })
      const { rows } = await admin.query(
        `SELECT c.commit_no::int AS n FROM studio.mutation_receipts r
           JOIN studio.commits c ON c.campus_id = r.campus_id AND c.mutation_id = r.mutation_id
          WHERE r.campus_id = $1 ORDER BY 1`,
        [campus],
      )
      expect(rows.map((r) => r.n)).toEqual([2, 3])
    })
  })
})

describe('read, publish and prune privileges', () => {
  it('every new function except prune is executable by navi_studio_api only; prune by neither', async () => {
    await withTestDb(async (client, admin) => {
      const apiFunctions = [
        'changes_since',
        'create_campus',
        'current_publication',
        'delete_campus',
        'list_campuses',
        'load',
        'parts_at_commit',
        'published_campuses',
        'record_publication',
        'rollback_publication',
        'update_campus_settings',
      ]
      const { rows } = await admin.query<{ proname: string; public_exec: boolean; api_exec: boolean; definer: boolean }>(
        `SELECT p.proname,
                has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
                has_function_privilege('navi_studio_api', p.oid, 'EXECUTE') AS api_exec,
                p.prosecdef AS definer
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'studio' AND p.proname = ANY ($1::text[])
          ORDER BY p.proname`,
        [[...apiFunctions, 'prune']],
      )
      expect(rows.map((r) => r.proname)).toEqual([...apiFunctions, 'prune'].sort())
      for (const r of rows) {
        expect(r.public_exec, `${r.proname} PUBLIC`).toBe(false)
        expect(r.api_exec, `${r.proname} api`).toBe(r.proname !== 'prune')
        expect(r.definer, `${r.proname} SECURITY DEFINER`).toBe(true)
      }
      await expect(client.query(`SELECT studio.prune('x')`)).rejects.toThrow(/permission denied/)
    })
  })
})
