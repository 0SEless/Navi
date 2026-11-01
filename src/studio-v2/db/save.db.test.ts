import { afterAll, describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { Client, type Queryable } from 'pg'
import { assertSaveV2TestTarget, saveV2ConnectionConfig } from '../../../scripts/save-v2/db-target.mjs'
import { closeTestDb, withTestDb, type TestDbClient } from './test-harness'

// studio.save is called through `client` (navi_savev2_runner, a member of
// navi_studio_api) to prove the API role can execute it; setup and inspection
// go through `admin`. Each test uses its own campus id, so tests are independent.

const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

afterAll(async () => {
  await closeTestDb()
})

const sha = (text: string | Buffer) => createHash('sha256').update(text).digest('hex')

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
  return {
    partKey,
    expectedVersion,
    op: 'put-bin',
    checksum: sha(bytes),
    contentBase64: bytes.toString('base64'),
    sizeBytes: bytes.length,
  }
}

function del(partKey: string, expectedVersion: number): Change {
  return { partKey, expectedVersion, op: 'delete' }
}

let campusSeq = 0

async function newCampus(
  admin: TestDbClient,
  members: Array<[userId: string, role: 'owner' | 'editor' | 'viewer']> = [],
): Promise<string> {
  const id = `save-${++campusSeq}-${randomUUID().slice(0, 8)}`
  await admin.query(`INSERT INTO studio.campuses (id, name, created_by) VALUES ($1, 'Test campus', 'alice')`, [id])
  for (const [userId, role] of members) {
    await admin.query(
      `INSERT INTO studio.members (campus_id, user_id, display_name, role) VALUES ($1, $2, $2, $3)`,
      [id, userId, role],
    )
  }
  return id
}

async function lockZone(
  admin: TestDbClient,
  campus: string,
  zoneKey: string,
  holder: string,
  sessionId: string,
  holderName: string,
  heartbeatAgo = '0 seconds',
): Promise<void> {
  await admin.query(
    `INSERT INTO studio.zone_locks (campus_id, zone_key, holder, holder_name, session_id, heartbeat_at, last_edit_at)
     VALUES ($1, $2, $3, $4, $5, now() - $6::interval, now() - interval '1 hour')`,
    [campus, zoneKey, holder, holderName, sessionId, heartbeatAgo],
  )
}

interface SaveArgs {
  campus: string
  changes: unknown
  actor?: string
  session?: string | null
  mutationId?: string
  baseCommit?: number
  message?: string | null
  requestChecksum?: string
  actorName?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SaveResult = any

async function save(db: Queryable, args: SaveArgs): Promise<SaveResult> {
  const changesJson = JSON.stringify(args.changes)
  const { rows } = await db.query(
    args.actorName === undefined
      ? `SELECT studio.save($1, $2, $3, $4, $5, $6, $7::jsonb, $8) AS r`
      : `SELECT studio.save($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) AS r`,
    [
      args.campus,
      args.actor ?? 'alice',
      args.session === undefined ? 's1' : args.session,
      args.mutationId ?? randomUUID(),
      args.baseCommit ?? 0,
      args.message === undefined ? 'test save' : args.message,
      changesJson,
      args.requestChecksum ?? sha(changesJson),
      ...(args.actorName === undefined ? [] : [args.actorName]),
    ],
  )
  return rows[0].r
}

async function counts(admin: TestDbClient, campus: string) {
  const { rows } = await admin.query(
    `SELECT (SELECT head_commit FROM studio.campuses WHERE id = $1)::int AS head,
            (SELECT count(*) FROM studio.commits WHERE campus_id = $1)::int AS commits,
            (SELECT count(*) FROM studio.part_versions WHERE campus_id = $1)::int AS versions,
            (SELECT count(*) FROM studio.parts_current WHERE campus_id = $1)::int AS current,
            (SELECT count(*) FROM studio.mutation_receipts WHERE campus_id = $1)::int AS receipts`,
    [campus],
  )
  return rows[0] as { head: number; commits: number; versions: number; current: number; receipts: number }
}

async function currentOf(admin: TestDbClient, campus: string, partKey: string) {
  const { rows } = await admin.query(
    `SELECT pc.version_no::int AS version, pc.checksum, pc.commit_no::int AS commit,
            pv.content, pv.content_bin, pv.deleted, pv.sort_key, pv.size_bytes
       FROM studio.parts_current pc
       JOIN studio.part_versions pv USING (campus_id, part_key, version_no)
      WHERE pc.campus_id = $1 AND pc.part_key = $2`,
    [campus, partKey],
  )
  return rows[0] ?? null
}

async function expectInvalid(promise: Promise<unknown>): Promise<void> {
  const error = (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as { code?: string; message?: string } | null
  expect(error, 'studio.save should have raised').not.toBeNull()
  expect(error?.code).toBe('22023')
  expect(error?.message).toMatch(/^INVALID_CHANGE:/)
}

describe('studio.save', () => {
  it('first save creates commit 1 and versions 1', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'editor']])
      await lockZone(admin, campus, 'building:B1', 'alice', 's1', 'Alice')
      const mutationId = randomUUID()
      const result = await save(client, {
        campus,
        mutationId,
        message: 'first',
        changes: [put('map/road:r1', { id: 'r1' }, 0, '0001'), put('building:B1', { id: 'B1' })],
      })

      expect(result).toEqual({
        status: 'ok',
        commitNo: 1,
        parts: [
          { partKey: 'building:B1', versionNo: 1, checksum: sha(JSON.stringify({ id: 'B1' })) },
          { partKey: 'map/road:r1', versionNo: 1, checksum: sha(JSON.stringify({ id: 'r1' })) },
        ],
        othersChanged: [],
      })
      expect(await counts(admin, campus)).toEqual({ head: 1, commits: 1, versions: 2, current: 2, receipts: 1 })

      const commit = await admin.query(
        `SELECT commit_no::int, parent_no::int, author, message, mutation_id, kind
           FROM studio.commits WHERE campus_id = $1`,
        [campus],
      )
      expect(commit.rows[0]).toEqual({
        commit_no: 1,
        parent_no: 0,
        author: 'alice',
        message: 'first',
        mutation_id: mutationId,
        kind: 'save',
      })

      const road = await currentOf(admin, campus, 'map/road:r1')
      expect(road).toMatchObject({ version: 1, commit: 1, content: { id: 'r1' }, deleted: false, sort_key: '0001' })
      expect(road.size_bytes).toBe(Buffer.byteLength(JSON.stringify({ id: 'r1' })))
      expect((await currentOf(admin, campus, 'building:B1')).sort_key).toBeNull()

      const lock = await admin.query(
        `SELECT last_edit_at > now() - interval '1 minute' AS fresh FROM studio.zone_locks WHERE campus_id = $1`,
        [campus],
      )
      expect(lock.rows[0].fresh).toBe(true)
    })
  })

  it('replay with same mutationId and checksum returns status replay and the same commitNo, and no second commit row', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      const args: SaveArgs = { campus, mutationId: randomUUID(), changes: [put('map/road:r1', { id: 'r1' })] }
      const first = await save(client, args)
      expect(first.status).toBe('ok')

      const second = await save(client, args)
      expect(second).toEqual({ ...first, status: 'replay' })
      expect(second.commitNo).toBe(1)
      expect(await counts(admin, campus)).toEqual({ head: 1, commits: 1, versions: 1, current: 1, receipts: 1 })
    })
  })

  it('same mutationId with different checksum gives mutation_collision', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      const mutationId = randomUUID()
      await save(client, { campus, mutationId, changes: [put('map/road:r1', { id: 'r1' })] })
      const result = await save(client, { campus, mutationId, changes: [put('map/road:r2', { id: 'r2' })] })
      expect(result).toEqual({ status: 'mutation_collision' })
      expect(await counts(admin, campus)).toEqual({ head: 1, commits: 1, versions: 1, current: 1, receipts: 1 })
    })
  })

  it('stale expectedVersion gives stale listing only that part, and nothing written', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, { campus, changes: [put('map/road:r1', { v: 1 }), put('map/road:r2', { v: 1 })] })

      const mutationId = randomUUID()
      const result = await save(client, {
        campus,
        actor: 'bob',
        mutationId,
        baseCommit: 0,
        changes: [put('map/road:r1', { v: 2 }, 0), put('map/road:r2', { v: 2 }, 1)],
      })
      expect(result.status).toBe('stale')
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]).toMatchObject({ partKey: 'map/road:r1', yourVersion: 0, currentVersion: 1, savedBy: 'alice' })
      expect(typeof result.parts[0].savedAt).toBe('string')
      expect(Number.isNaN(Date.parse(result.parts[0].savedAt))).toBe(false)

      expect(await counts(admin, campus)).toEqual({ head: 1, commits: 1, versions: 2, current: 2, receipts: 1 })
      expect((await currentOf(admin, campus, 'map/road:r2')).content).toEqual({ v: 1 })
      const receipt = await admin.query(`SELECT 1 FROM studio.mutation_receipts WHERE mutation_id = $1`, [mutationId])
      expect(receipt.rows).toHaveLength(0)
    })
  })

  it('a stale part names who saved it by display name (the copy "This road was changed by ana")', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, { campus, actor: 'user-7f3a', actorName: 'ana', changes: [put('map/road:r1', { v: 1 })] })
      const result = await save(client, { campus, actor: 'bob', changes: [put('map/road:r1', { v: 2 }, 0)] })
      expect(result.status).toBe('stale')
      expect(result.parts[0]).toMatchObject({ partKey: 'map/road:r1', savedBy: 'ana' })
    })
  })

  it('saving floor:B1:F1 without holding building:B1 gives zone_not_held', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      const free = await save(client, { campus, changes: [put('floor:B1:F1', { id: 'F1' })] })
      expect(free).toEqual({ status: 'zone_not_held', zones: [{ zoneKey: 'building:B1', holderName: null }] })

      await lockZone(admin, campus, 'building:B1', 'bob', 'sb', 'Bob')
      const held = await save(client, { campus, changes: [put('floor:B1:F1', { id: 'F1' }), put('campus', { c: 1 })] })
      expect(held).toEqual({
        status: 'zone_not_held',
        zones: [
          { zoneKey: 'building:B1', holderName: 'Bob' },
          { zoneKey: 'campus', holderName: null },
        ],
      })
      expect(await counts(admin, campus)).toEqual({ head: 0, commits: 0, versions: 0, current: 0, receipts: 0 })
    })
  })

  it('zone held by the same actor in a different session gives zone_not_held', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await lockZone(admin, campus, 'terrain', 'alice', 'other-tab', 'Alice')
      const result = await save(client, { campus, session: 's1', changes: [put('terrain', { t: 1 })] })
      expect(result).toEqual({ status: 'zone_not_held', zones: [{ zoneKey: 'terrain', holderName: 'Alice' }] })
      const noSession = await save(client, { campus, session: null, changes: [put('terrain', { t: 1 })] })
      expect(noSession.status).toBe('zone_not_held')
      expect(await counts(admin, campus)).toEqual({ head: 0, commits: 0, versions: 0, current: 0, receipts: 0 })
    })
  })

  it('a zone lock with a 6-minute-old heartbeat gives zone_not_held', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await lockZone(admin, campus, 'building:B1', 'alice', 's1', 'Alice', '6 minutes')
      const result = await save(client, { campus, changes: [put('building:B1', { id: 'B1' })] })
      expect(result).toEqual({ status: 'zone_not_held', zones: [{ zoneKey: 'building:B1', holderName: null }] })
      expect(await counts(admin, campus)).toEqual({ head: 0, commits: 0, versions: 0, current: 0, receipts: 0 })
    })
  })

  it('both stale and zone failures in one request give zone_not_held and nothing written', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, { campus, changes: [put('map/road:r1', { v: 1 })] })
      const result = await save(client, {
        campus,
        changes: [put('map/road:r1', { v: 2 }, 0), put('building:B1', { id: 'B1' })],
      })
      expect(result).toEqual({ status: 'zone_not_held', zones: [{ zoneKey: 'building:B1', holderName: null }] })
      expect(await counts(admin, campus)).toEqual({ head: 1, commits: 1, versions: 1, current: 1, receipts: 1 })
    })
  })

  it('map/road save needs no lock', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      const result = await save(client, { campus, session: null, changes: [put('map/road:r1', { id: 'r1' })] })
      expect(result.status).toBe('ok')
      expect(result.commitNo).toBe(1)
    })
  })

  it('all-no-op request gives commitNo null and no commit row', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, { campus, changes: [put('map/road:r1', { id: 'r1' }, 0, '0001')] })

      // Same content; a sortKey change alone does not create a version (R5).
      const args: SaveArgs = {
        campus,
        mutationId: randomUUID(),
        changes: [put('map/road:r1', { id: 'r1' }, 1, '0002'), del('map/road:never-existed', 0)],
      }
      const result = await save(client, args)
      expect(result).toEqual({ status: 'ok', commitNo: null, parts: [], othersChanged: [] })
      expect(await counts(admin, campus)).toEqual({ head: 1, commits: 1, versions: 1, current: 1, receipts: 2 })
      expect((await currentOf(admin, campus, 'map/road:r1')).sort_key).toBe('0001')

      const replay = await save(client, args)
      expect(replay).toEqual({ ...result, status: 'replay' })
    })
  })

  it('forced error mid-batch (invalid op) writes nothing', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await lockZone(admin, campus, 'building:B1', 'alice', 's1', 'Alice')
      await expectInvalid(
        save(client, {
          campus,
          changes: [
            put('map/road:r1', { id: 'r1' }),
            put('building:B1', { id: 'B1' }),
            { partKey: 'map/road:r2', expectedVersion: 0, op: 'move', checksum: 'a'.repeat(64) },
          ],
        }),
      )
      expect(await counts(admin, campus)).toEqual({ head: 0, commits: 0, versions: 0, current: 0, receipts: 0 })
    })
  })

  it('invalid input raises INVALID_CHANGE (22023) and writes nothing', async () => {
    const good = put('map/road:r1', { id: 'r1' })
    const cases: Array<[string, unknown]> = [
      ['changes not an array', { partKey: 'map/road:r1' }],
      ['change not an object', ['map/road:r1']],
      ['missing partKey', [{ ...good, partKey: undefined }]],
      ['empty partKey', [{ ...good, partKey: '' }]],
      ['duplicate partKey', [good, good]],
      ['unknown op', [{ ...good, op: 'upsert' }]],
      ['missing expectedVersion', [{ ...good, expectedVersion: undefined }]],
      ['negative expectedVersion', [{ ...good, expectedVersion: -1 }]],
      ['fractional expectedVersion', [{ ...good, expectedVersion: 1.5 }]],
      ['string expectedVersion', [{ ...good, expectedVersion: '0' }]],
      ['uppercase checksum', [{ ...good, checksum: 'A'.repeat(64) }]],
      ['short checksum', [{ ...good, checksum: 'a'.repeat(63) }]],
      ['put without content', [{ ...good, content: undefined }]],
      ['put with null content', [{ ...good, content: null }]],
      ['put without sizeBytes', [{ ...good, sizeBytes: undefined }]],
      ['put-bin without contentBase64', [{ ...putBin('terrain-tile:t1', Buffer.from('x')), contentBase64: undefined }]],
      ['put-bin with bad base64', [{ ...putBin('terrain-tile:t1', Buffer.from('x')), contentBase64: '***' }]],
      ['non-string sortKey', [{ ...good, sortKey: 7 }]],
      ['unknown part kind', [put('panorama:p1', {})]],
      ['bad part key arity', [put('floor:onlyone', {})]],
    ]
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await lockZone(admin, campus, 'terrain', 'alice', 's1', 'Alice')
      for (const [label, changes] of cases) {
        const error = (await save(client, { campus, changes }).then(
          () => null,
          (e: unknown) => e,
        )) as { code?: string; message?: string } | null
        expect({ label, code: error?.code, invalid: /^INVALID_CHANGE:/.test(error?.message ?? '') }).toEqual({
          label,
          code: '22023',
          invalid: true,
        })
      }
      expect(await counts(admin, campus)).toEqual({ head: 0, commits: 0, versions: 0, current: 0, receipts: 0 })
    })
  })

  it('othersChanged returns a road saved by another actor after baseCommit', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      // commit 1: alice's own road; commit 2: bob's roads; commit 3: bob deletes one.
      await save(client, { campus, actor: 'alice', changes: [put('map/road:own', { id: 'own' })] })
      await save(client, {
        campus,
        actor: 'bob',
        baseCommit: 1,
        changes: [
          put('map/road:r9', { id: 'r9' }, 0, '0009'),
          put('map/road:shared', { id: 'shared', by: 'bob' }),
          put('map/road:gone', { id: 'gone' }),
        ],
      })
      await save(client, { campus, actor: 'bob', baseCommit: 2, changes: [del('map/road:gone', 1)] })

      const result = await save(client, {
        campus,
        actor: 'alice',
        baseCommit: 1,
        changes: [put('map/road:shared', { id: 'shared', by: 'alice' }, 1), put('map/road:new', { id: 'new' })],
      })
      expect(result.status).toBe('ok')
      expect(result.commitNo).toBe(4)
      expect(result.othersChanged).toEqual([
        { partKey: 'map/road:gone', versionNo: 2, checksum: EMPTY_SHA, content: null, deleted: true, sortKey: null },
        {
          partKey: 'map/road:r9',
          versionNo: 1,
          checksum: sha(JSON.stringify({ id: 'r9' })),
          content: { id: 'r9' },
          deleted: false,
          sortKey: '0009',
        },
      ])

      // baseCommit at bob's last commit: nothing new from others.
      const later = await save(client, {
        campus,
        actor: 'alice',
        baseCommit: 4,
        changes: [put('map/road:own', { id: 'own', v: 2 }, 1)],
      })
      expect(later.othersChanged).toEqual([])
    })
  })

  it('viewer gives forbidden; owner, editor and non-members may save', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [
        ['vic', 'viewer'],
        ['olga', 'owner'],
        ['ed', 'editor'],
      ])
      const forbidden = await save(client, { campus, actor: 'vic', changes: [put('map/road:v', { id: 'v' })] })
      expect(forbidden).toEqual({ status: 'forbidden' })
      expect(await counts(admin, campus)).toEqual({ head: 0, commits: 0, versions: 0, current: 0, receipts: 0 })

      for (const actor of ['olga', 'ed', 'nobody']) {
        const ok = await save(client, { campus, actor, changes: [put(`map/road:${actor}`, { id: actor })] })
        expect({ actor, status: ok.status }).toEqual({ actor, status: 'ok' })
      }
    })
  })

  it('a missing campus gives campus_not_found', async () => {
    await withTestDb(async (client) => {
      const result = await save(client, { campus: `missing-${randomUUID()}`, changes: [put('map/road:r1', {})] })
      expect(result).toEqual({ status: 'campus_not_found' })
    })
  })

  it('put-bin round trip stores the bytes in content_bin', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await lockZone(admin, campus, 'terrain', 'alice', 's1', 'Alice')
      const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, ...Buffer.alloc(200, 7)])
      const result = await save(client, { campus, changes: [putBin('terrain-tile:t1', bytes)] })
      expect(result).toMatchObject({ status: 'ok', commitNo: 1, parts: [{ partKey: 'terrain-tile:t1', versionNo: 1 }] })

      const stored = await currentOf(admin, campus, 'terrain-tile:t1')
      expect(stored.content).toBeNull()
      expect(Buffer.compare(stored.content_bin as Buffer, bytes)).toBe(0)
      expect(stored.size_bytes).toBe(bytes.length)
      expect(stored.checksum).toBe(sha(bytes))

      // Another actor sees the tile as base64 in othersChanged.
      const bob = await save(client, { campus, actor: 'bob', changes: [put('map/road:b', { id: 'b' })] })
      expect(bob.othersChanged).toEqual([
        {
          partKey: 'terrain-tile:t1',
          versionNo: 1,
          checksum: sha(bytes),
          contentBase64: bytes.toString('base64'),
          deleted: false,
          sortKey: null,
        },
      ])
    })
  })

  it('delete writes a tombstone, repeat deletes are no-ops, and the part can be re-created', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await save(client, { campus, changes: [put('map/road:r1', { id: 'r1' })] })

      const deleted = await save(client, { campus, changes: [del('map/road:r1', 1)] })
      expect(deleted).toEqual({
        status: 'ok',
        commitNo: 2,
        parts: [{ partKey: 'map/road:r1', versionNo: 2, checksum: EMPTY_SHA }],
        othersChanged: [],
      })
      expect(await currentOf(admin, campus, 'map/road:r1')).toMatchObject({
        version: 2,
        commit: 2,
        checksum: EMPTY_SHA,
        content: null,
        content_bin: null,
        deleted: true,
        size_bytes: 0,
      })

      const again = await save(client, { campus, changes: [del('map/road:r1', 2)] })
      expect(again).toMatchObject({ status: 'ok', commitNo: null, parts: [] })

      const staleRecreate = await save(client, { campus, changes: [put('map/road:r1', { id: 'r1', v: 3 }, 0)] })
      expect(staleRecreate.status).toBe('stale')

      const recreated = await save(client, { campus, changes: [put('map/road:r1', { id: 'r1', v: 3 }, 2)] })
      expect(recreated).toMatchObject({ status: 'ok', commitNo: 3, parts: [{ partKey: 'map/road:r1', versionNo: 3 }] })
      expect(await currentOf(admin, campus, 'map/road:r1')).toMatchObject({ version: 3, deleted: false, content: { id: 'r1', v: 3 } })
      expect(await counts(admin, campus)).toEqual({ head: 3, commits: 3, versions: 3, current: 1, receipts: 4 })
    })
  })

  it('concurrent saves on the same campus serialize on the campus row', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      const holder = new Client(saveV2ConnectionConfig())
      await holder.connect()
      try {
        await assertSaveV2TestTarget(holder)
        await client.query(`SET statement_timeout = '10s'`)
        const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        const clientPid = rows[0].pid

        await holder.query('BEGIN')
        await holder.query('SELECT 1 FROM studio.campuses WHERE id = $1 FOR UPDATE', [campus])
        const first = await save(holder, { campus, actor: 'bob', changes: [put('map/road:bob', { id: 'bob' })] })
        expect(first.commitNo).toBe(1)

        let settled = false
        const pending = save(client, { campus, actor: 'alice', changes: [put('map/road:alice', { id: 'alice' })] }).finally(
          () => {
            settled = true
          },
        )

        // Wait (bounded) until the client's save is blocked on the campus row lock.
        let waiting = false
        for (let i = 0; i < 100 && !waiting; i++) {
          const activity = await admin.query(
            `SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1`,
            [clientPid],
          )
          waiting = activity.rows[0]?.wait_event_type === 'Lock'
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50))
        }
        expect(waiting).toBe(true)
        expect(settled).toBe(false)

        await holder.query('COMMIT')
        const second = await pending
        expect(second.status).toBe('ok')
        expect(second.commitNo).toBe(2)
        expect(second.othersChanged.map((p: { partKey: string }) => p.partKey)).toEqual(['map/road:bob'])
        expect(await counts(admin, campus)).toEqual({ head: 2, commits: 2, versions: 2, current: 2, receipts: 2 })
      } finally {
        await holder.query('ROLLBACK').catch(() => undefined)
        await holder.end()
        await client.query('RESET statement_timeout')
      }
    })
  })

  it('the API role cannot read mutation_receipts or call the internal helpers', async () => {
    await withTestDb(async (client) => {
      await expect(client.query('SELECT * FROM studio.mutation_receipts')).rejects.toThrow(/permission denied/)
      await expect(client.query(`SELECT studio.save_parse_changes('[]'::jsonb)`)).rejects.toThrow(/permission denied/)
    })
  })
})
