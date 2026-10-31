import { afterAll, describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { assertSaveV2TestTarget, saveV2ConnectionConfig } from '../../../scripts/save-v2/db-target.mjs'
import { closeTestDb, withTestDb, type TestDbClient } from './test-harness'

// Zone lock functions are called through `client` (navi_savev2_runner, a member of
// navi_studio_api); setup and inspection go through `admin`. Each test has its own campus.

afterAll(async () => {
  await closeTestDb()
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any
type Db = Pick<TestDbClient, 'query'>

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

let campusSeq = 0

async function newCampus(
  admin: TestDbClient,
  members: Array<[userId: string, role: 'owner' | 'editor' | 'viewer']> = [],
): Promise<string> {
  const id = `lock-${++campusSeq}-${randomUUID().slice(0, 8)}`
  await admin.query(`INSERT INTO studio.campuses (id, name, created_by) VALUES ($1, 'Test campus', 'alice')`, [id])
  for (const [userId, role] of members) {
    await admin.query(
      `INSERT INTO studio.members (campus_id, user_id, display_name, role) VALUES ($1, $2, $2, $3)`,
      [id, userId, role],
    )
  }
  return id
}

async function acquire(
  db: Db,
  campus: string,
  zones: string[] | null,
  actor = 'alice',
  session = 's1',
  name = 'Alice',
): Promise<Json> {
  const { rows } = await db.query(`SELECT studio.acquire_zones($1, $2, $3, $4, $5) AS r`, [
    campus,
    actor,
    name,
    session,
    zones,
  ])
  return rows[0].r
}

async function release(db: Db, campus: string, zones: string[], actor = 'alice', session = 's1'): Promise<Json> {
  const { rows } = await db.query(`SELECT studio.release_zones($1, $2, $3, $4) AS r`, [campus, actor, session, zones])
  return rows[0].r
}

async function status(db: Db, campus: string, held: string[], actor = 'alice', session = 's1'): Promise<Json> {
  const { rows } = await db.query(`SELECT studio.status($1, $2, $3, $4) AS r`, [campus, actor, session, held])
  return rows[0].r
}

async function forceRelease(
  db: Db,
  campus: string,
  actor: string,
  zone: string,
  superAdmin?: boolean,
): Promise<Json> {
  const { rows } =
    superAdmin === undefined
      ? await db.query(`SELECT studio.force_release($1, $2, $3) AS r`, [campus, actor, zone])
      : await db.query(`SELECT studio.force_release($1, $2, $3, $4) AS r`, [campus, actor, zone, superAdmin])
  return rows[0].r
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
    `INSERT INTO studio.zone_locks (campus_id, zone_key, holder, holder_name, session_id, acquired_at, heartbeat_at, last_edit_at)
     VALUES ($1, $2, $3, $4, $5, now() - interval '1 hour', now() - $6::interval, now() - interval '1 hour')`,
    [campus, zoneKey, holder, holderName, sessionId, heartbeatAgo],
  )
}

async function lockRows(admin: TestDbClient, campus: string) {
  const { rows } = await admin.query(
    `SELECT zone_key, holder, holder_name, session_id, acquired_at, heartbeat_at, last_edit_at
       FROM studio.zone_locks WHERE campus_id = $1 ORDER BY zone_key COLLATE "C"`,
    [campus],
  )
  return rows as Array<{
    zone_key: string
    holder: string
    holder_name: string
    session_id: string
    acquired_at: Date
    heartbeat_at: Date
    last_edit_at: Date
  }>
}

async function saveFloor(db: Db, campus: string, actor: string, session: string): Promise<Json> {
  const content = { id: 'F1' }
  const text = JSON.stringify(content)
  const changes = JSON.stringify([
    {
      partKey: 'floor:B1:F1',
      expectedVersion: 0,
      op: 'put',
      checksum: sha(text),
      content,
      sizeBytes: Buffer.byteLength(text),
    },
  ])
  const { rows } = await db.query(`SELECT studio.save($1, $2, $3, $4, 0, 'lock test', $5::jsonb, $6) AS r`, [
    campus,
    actor,
    session,
    randomUUID(),
    changes,
    sha(changes),
  ])
  return rows[0].r
}

async function expectInvalidZone(promise: Promise<unknown>): Promise<void> {
  const error = (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as { code?: string; message?: string } | null
  expect(error, 'should have raised').not.toBeNull()
  expect(error?.code).toBe('22023')
  expect(error?.message).toMatch(/^INVALID_ZONE:/)
}

describe('studio.acquire_zones', () => {
  it('grants free zones and records the holder', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'editor']])
      const result = await acquire(client, campus, ['terrain', 'building:B1'])
      expect(result).toEqual({ status: 'ok', granted: ['building:B1', 'terrain'], denied: [] })

      const rows = await lockRows(admin, campus)
      expect(rows.map((r) => [r.zone_key, r.holder, r.holder_name, r.session_id])).toEqual([
        ['building:B1', 'alice', 'Alice', 's1'],
        ['terrain', 'alice', 'Alice', 's1'],
      ])
    })
  })

  it('second actor is denied the building and sees holderName', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [
        ['alice', 'editor'],
        ['bob', 'editor'],
      ])
      await acquire(client, campus, ['building:B1'])
      const result = await acquire(client, campus, ['building:B1'], 'bob', 'sb', 'Bob')
      expect(result.status).toBe('ok')
      expect(result.granted).toEqual([])
      expect(result.denied).toHaveLength(1)
      expect(result.denied[0]).toMatchObject({ zoneKey: 'building:B1', holderName: 'Alice', sameActor: false })
      expect(Number.isNaN(Date.parse(result.denied[0].since))).toBe(false)

      const rows = await lockRows(admin, campus)
      expect(rows.map((r) => [r.zone_key, r.holder])).toEqual([['building:B1', 'alice']])
    })
  })

  it('same actor, other session is denied with sameActor true', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'editor']])
      await acquire(client, campus, ['building:B1'], 'alice', 's1')
      const result = await acquire(client, campus, ['building:B1'], 'alice', 's2')
      expect(result.granted).toEqual([])
      expect(result.denied).toEqual([
        { zoneKey: 'building:B1', holderName: 'Alice', since: expect.any(String), sameActor: true },
      ])
      expect((await lockRows(admin, campus))[0].session_id).toBe('s1')
    })
  })

  it('same actor and session re-acquire refreshes the heartbeat and keeps acquired_at', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'editor']])
      await lockZone(admin, campus, 'building:B1', 'alice', 's1', 'Alice', '2 minutes')
      const before = (await lockRows(admin, campus))[0]
      const result = await acquire(client, campus, ['building:B1'])
      expect(result).toEqual({ status: 'ok', granted: ['building:B1'], denied: [] })
      const after = (await lockRows(admin, campus))[0]
      expect(after.acquired_at.getTime()).toBe(before.acquired_at.getTime())
      expect(after.heartbeat_at.getTime()).toBeGreaterThan(before.heartbeat_at.getTime() + 60_000)
    })
  })

  it('lock with heartbeat 6 minutes old is acquirable', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [
        ['alice', 'editor'],
        ['bob', 'editor'],
      ])
      await lockZone(admin, campus, 'building:B1', 'alice', 's1', 'Alice', '6 minutes')
      const result = await acquire(client, campus, ['building:B1'], 'bob', 'sb', 'Bob')
      expect(result).toEqual({ status: 'ok', granted: ['building:B1'], denied: [] })

      const rows = await lockRows(admin, campus)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ holder: 'bob', holder_name: 'Bob', session_id: 'sb' })
      // The row was overwritten: fresh acquired_at (was 1 hour ago) and heartbeat.
      expect(Date.now() - rows[0].acquired_at.getTime()).toBeLessThan(60_000)
      expect(Date.now() - rows[0].heartbeat_at.getTime()).toBeLessThan(60_000)
    })
  })

  it('a lock with heartbeat 4 minutes old still blocks', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [
        ['alice', 'editor'],
        ['bob', 'editor'],
      ])
      await lockZone(admin, campus, 'building:B1', 'alice', 's1', 'Alice', '4 minutes')
      const result = await acquire(client, campus, ['building:B1'], 'bob', 'sb', 'Bob')
      expect(result.granted).toEqual([])
      expect(result.denied[0]).toMatchObject({ zoneKey: 'building:B1', holderName: 'Alice', sameActor: false })
    })
  })

  it('acquire of [building:A, building:B] when B is held gives no rows granted', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [
        ['alice', 'editor'],
        ['bob', 'editor'],
      ])
      await lockZone(admin, campus, 'building:B', 'bob', 'sb', 'Bob')
      const result = await acquire(client, campus, ['building:A', 'building:B'])
      expect(result.status).toBe('ok')
      expect(result.granted).toEqual([])
      expect(result.denied.map((d: Json) => d.zoneKey)).toEqual(['building:B'])

      const rows = await lockRows(admin, campus)
      expect(rows.map((r) => r.zone_key)).toEqual(['building:B'])
    })
  })

  it('duplicate zones in one acquire are accepted', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'editor']])
      const result = await acquire(client, campus, ['building:B1', 'building:B1', 'terrain', 'terrain'])
      expect(result).toEqual({ status: 'ok', granted: ['building:B1', 'terrain'], denied: [] })
      expect(await lockRows(admin, campus)).toHaveLength(2)
    })
  })

  it('an empty zone list is a no-op', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'editor']])
      expect(await acquire(client, campus, [])).toEqual({ status: 'ok', granted: [], denied: [] })
      expect(await lockRows(admin, campus)).toHaveLength(0)
    })
  })

  it('viewer acquire is forbidden and takes nothing', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['vera', 'viewer']])
      const result = await acquire(client, campus, ['building:B1'], 'vera', 'sv', 'Vera')
      expect(result).toEqual({ status: 'forbidden' })
      expect(await lockRows(admin, campus)).toHaveLength(0)
    })
  })

  it('unknown campus returns campus_not_found', async () => {
    await withTestDb(async (client) => {
      expect(await acquire(client, 'no-such-campus', ['terrain'])).toEqual({ status: 'campus_not_found' })
    })
  })

  it('rejects invalid zone keys with 22023 INVALID_ZONE', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'editor']])
      await expectInvalidZone(acquire(client, campus, ['floor:B1:F1']))
      await expectInvalidZone(acquire(client, campus, ['map/road:r1']))
      await expectInvalidZone(acquire(client, campus, ['building:B1', 'bogus']))
      await expectInvalidZone(acquire(client, campus, ['building:']))
      await expectInvalidZone(acquire(client, campus, ['building:B%31']))
      await expectInvalidZone(acquire(client, campus, ['']))
      await expectInvalidZone(acquire(client, campus, [null as unknown as string]))
      await expectInvalidZone(acquire(client, campus, null))
      expect(await lockRows(admin, campus)).toHaveLength(0)
    })
  })

  it('rejects empty actor, actor name or session with 22023 INVALID_ZONE', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'editor']])
      await expectInvalidZone(acquire(client, campus, ['terrain'], '', 's1'))
      await expectInvalidZone(acquire(client, campus, ['terrain'], 'alice', ''))
      await expectInvalidZone(acquire(client, campus, ['terrain'], 'alice', 's1', '   '))
      await expectInvalidZone(acquire(client, campus, ['terrain'], 'alice', 's1', ''))
    })
  })

  it('waits for the campus row lock, then denies the zone that was taken meanwhile', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [
        ['alice', 'editor'],
        ['bob', 'editor'],
      ])
      const holder = new Client(saveV2ConnectionConfig())
      await holder.connect()
      try {
        await assertSaveV2TestTarget(holder)
        await client.query(`SET statement_timeout = '10s'`)
        const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        const clientPid = rows[0].pid

        // Bob's acquire runs inside a transaction that holds the campus row lock first.
        await holder.query('BEGIN')
        await holder.query('SELECT 1 FROM studio.campuses WHERE id = $1 FOR UPDATE', [campus])
        const bob = await acquire(holder, campus, ['building:B1'], 'bob', 'sb', 'Bob')
        expect(bob.granted).toEqual(['building:B1'])

        let settled = false
        const pending = acquire(client, campus, ['building:B1'], 'alice', 's1', 'Alice').finally(() => {
          settled = true
        })

        let waiting = false
        for (let i = 0; i < 100 && !waiting; i++) {
          const activity = await admin.query(`SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1`, [clientPid])
          waiting = activity.rows[0]?.wait_event_type === 'Lock'
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50))
        }
        expect(waiting).toBe(true)
        expect(settled).toBe(false)

        await holder.query('COMMIT')
        const alice = await pending
        expect(alice.granted).toEqual([])
        expect(alice.denied[0]).toMatchObject({ zoneKey: 'building:B1', holderName: 'Bob', sameActor: false })

        const after = await lockRows(admin, campus)
        expect(after.map((r) => [r.zone_key, r.holder])).toEqual([['building:B1', 'bob']])
      } finally {
        await holder.query('ROLLBACK').catch(() => undefined)
        await holder.end()
        await client.query('RESET statement_timeout')
      }
    })
  })

  it('simultaneous acquires of the same zone from two connections grant exactly one', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [
        ['alice', 'editor'],
        ['bob', 'editor'],
      ])
      const other = new Client(saveV2ConnectionConfig())
      await other.connect()
      try {
        await assertSaveV2TestTarget(other)
        const [a, b] = await Promise.all([
          acquire(client, campus, ['terrain'], 'alice', 's1', 'Alice'),
          acquire(other, campus, ['terrain'], 'bob', 'sb', 'Bob'),
        ])
        expect(a.granted.length + b.granted.length).toBe(1)
        expect(a.denied.length + b.denied.length).toBe(1)
        expect(await lockRows(admin, campus)).toHaveLength(1)
      } finally {
        await other.end()
      }
    })
  })
})

describe('studio.release_zones', () => {
  it('deletes only rows owned by this actor and session', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [
        ['alice', 'editor'],
        ['bob', 'editor'],
      ])
      await lockZone(admin, campus, 'building:B1', 'alice', 's1', 'Alice')
      await lockZone(admin, campus, 'building:B2', 'bob', 'sb', 'Bob')
      await lockZone(admin, campus, 'building:B3', 'alice', 's2', 'Alice')
      const result = await release(client, campus, ['building:B1', 'building:B2', 'building:B3', 'terrain'])
      expect(result).toEqual({ status: 'ok', released: ['building:B1'] })
      const rows = await lockRows(admin, campus)
      expect(rows.map((r) => r.zone_key)).toEqual(['building:B2', 'building:B3'])
    })
  })

  it('unknown campus returns campus_not_found; invalid zone raises', async () => {
    await withTestDb(async (client, admin) => {
      expect(await release(client, 'no-such-campus', ['terrain'])).toEqual({ status: 'campus_not_found' })
      const campus = await newCampus(admin, [['alice', 'editor']])
      await expectInvalidZone(release(client, campus, ['floor:B1:F1']))
      expect(await release(client, campus, [])).toEqual({ status: 'ok', released: [] })
    })
  })
})

describe('studio.status', () => {
  it('status refreshes heartbeat', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'editor']])
      await lockZone(admin, campus, 'building:B1', 'alice', 's1', 'Alice', '3 minutes')
      const before = (await lockRows(admin, campus))[0]
      const result = await status(client, campus, ['building:B1'])
      expect(result.status).toBe('ok')
      expect(result.lostZones).toEqual([])
      const after = (await lockRows(admin, campus))[0]
      expect(after.heartbeat_at.getTime()).toBeGreaterThan(before.heartbeat_at.getTime() + 60_000)
      expect(after.acquired_at.getTime()).toBe(before.acquired_at.getTime())
    })
  })

  it('reports headCommit and every live lock with holderIsMe, ordered by zone key', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [
        ['alice', 'editor'],
        ['bob', 'editor'],
      ])
      await admin.query(`UPDATE studio.campuses SET head_commit = 7 WHERE id = $1`, [campus])
      await lockZone(admin, campus, 'terrain', 'bob', 'sb', 'Bob')
      await lockZone(admin, campus, 'building:B1', 'alice', 's1', 'Alice')
      await lockZone(admin, campus, 'campus', 'bob', 'sb', 'Bob', '10 minutes') // expired, other holder
      await lockZone(admin, campus, 'building:B2', 'alice', 's2', 'Alice') // same actor, other session
      const result = await status(client, campus, [])
      expect(result.status).toBe('ok')
      expect(result.headCommit).toBe(7)
      expect(result.lostZones).toEqual([])
      expect(result.locks).toEqual([
        { zoneKey: 'building:B1', holderName: 'Alice', holderIsMe: true, since: expect.any(String) },
        { zoneKey: 'building:B2', holderName: 'Alice', holderIsMe: false, since: expect.any(String) },
        { zoneKey: 'terrain', holderName: 'Bob', holderIsMe: false, since: expect.any(String) },
      ])
    })
  })

  it('status revives a 6-minute-old own lock and a subsequent save works', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'editor']])
      await lockZone(admin, campus, 'building:B1', 'alice', 's1', 'Alice', '6 minutes')
      // Expired: save refuses.
      expect((await saveFloor(client, campus, 'alice', 's1')).status).toBe('zone_not_held')

      const result = await status(client, campus, ['building:B1'])
      expect(result.lostZones).toEqual([])
      expect(result.locks.map((l: Json) => [l.zoneKey, l.holderIsMe])).toEqual([['building:B1', true]])
      const saved = await saveFloor(client, campus, 'alice', 's1')
      expect(saved.status).toBe('ok')
      expect(saved.commitNo).toBe(1)
    })
  })

  it('status reports lostZones after force_release', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [
        ['alice', 'editor'],
        ['olga', 'owner'],
      ])
      await acquire(client, campus, ['building:B1', 'terrain'])
      expect(await forceRelease(client, campus, 'olga', 'building:B1')).toEqual({ status: 'ok', released: true })
      const result = await status(client, campus, ['building:B1', 'terrain'])
      expect(result.lostZones).toEqual(['building:B1'])
      expect(result.locks.map((l: Json) => l.zoneKey)).toEqual(['terrain'])
    })
  })

  it('a held zone now owned by someone else is lost and listed with holderIsMe false', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [
        ['alice', 'editor'],
        ['bob', 'editor'],
      ])
      await lockZone(admin, campus, 'building:B1', 'alice', 's1', 'Alice', '6 minutes')
      expect((await acquire(client, campus, ['building:B1'], 'bob', 'sb', 'Bob')).granted).toEqual(['building:B1'])
      const before = (await lockRows(admin, campus))[0]

      const result = await status(client, campus, ['building:B1'])
      expect(result.lostZones).toEqual(['building:B1'])
      expect(result.locks).toEqual([
        { zoneKey: 'building:B1', holderName: 'Bob', holderIsMe: false, since: expect.any(String) },
      ])
      // The other holder's heartbeat is untouched by Alice's status call.
      expect((await lockRows(admin, campus))[0].heartbeat_at.getTime()).toBe(before.heartbeat_at.getTime())
    })
  })

  it('a zone held by the same actor in another session is lost for this session', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'editor']])
      await lockZone(admin, campus, 'terrain', 'alice', 's2', 'Alice')
      const result = await status(client, campus, ['terrain'], 'alice', 's1')
      expect(result.lostZones).toEqual(['terrain'])
      expect(result.locks[0]).toMatchObject({ zoneKey: 'terrain', holderIsMe: false })
    })
  })

  it('unknown campus returns campus_not_found; invalid zone raises', async () => {
    await withTestDb(async (client, admin) => {
      expect(await status(client, 'no-such-campus', [])).toEqual({ status: 'campus_not_found' })
      const campus = await newCampus(admin, [['alice', 'editor']])
      await expectInvalidZone(status(client, campus, ['map/road:r1']))
    })
  })
})

describe('studio.force_release', () => {
  it('force_release by editor releases nothing (forbidden)', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [
        ['alice', 'editor'],
        ['bob', 'editor'],
      ])
      await lockZone(admin, campus, 'building:B1', 'alice', 's1', 'Alice')
      const result = await forceRelease(client, campus, 'bob', 'building:B1')
      expect(result).toEqual({ status: 'forbidden' })
      expect(await lockRows(admin, campus)).toHaveLength(1)
    })
  })

  it('owner releases the lock; releasing a free zone returns released false', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [
        ['alice', 'editor'],
        ['olga', 'owner'],
      ])
      await lockZone(admin, campus, 'building:B1', 'alice', 's1', 'Alice')
      expect(await forceRelease(client, campus, 'olga', 'building:B1')).toEqual({ status: 'ok', released: true })
      expect(await lockRows(admin, campus)).toHaveLength(0)
      expect(await forceRelease(client, campus, 'olga', 'building:B1')).toEqual({ status: 'ok', released: false })
    })
  })

  it('super admin may force-release without being a member', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'editor']])
      await lockZone(admin, campus, 'terrain', 'alice', 's1', 'Alice')
      expect(await forceRelease(client, campus, 'root', 'terrain')).toEqual({ status: 'forbidden' })
      expect(await forceRelease(client, campus, 'root', 'terrain', false)).toEqual({ status: 'forbidden' })
      expect(await forceRelease(client, campus, 'root', 'terrain', true)).toEqual({ status: 'ok', released: true })
    })
  })

  it('a viewer is forbidden; unknown campus is campus_not_found; invalid zone raises', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [
        ['vera', 'viewer'],
        ['olga', 'owner'],
      ])
      expect(await forceRelease(client, campus, 'vera', 'terrain')).toEqual({ status: 'forbidden' })
      expect(await forceRelease(client, 'no-such-campus', 'vera', 'terrain')).toEqual({ status: 'campus_not_found' })
      await expectInvalidZone(forceRelease(client, campus, 'olga', 'floor:B1:F1'))
    })
  })
})

describe('locks with studio.save', () => {
  it('acquire then save floor part succeeds; after release the same save is zone_not_held', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin, [['alice', 'editor']])
      expect((await acquire(client, campus, ['building:B1'])).granted).toEqual(['building:B1'])
      const saved = await saveFloor(client, campus, 'alice', 's1')
      expect(saved.status).toBe('ok')
      expect(saved.parts.map((p: Json) => p.partKey)).toEqual(['floor:B1:F1'])
      // last_edit_at was touched by the save.
      const row = (await lockRows(admin, campus))[0]
      expect(Date.now() - row.last_edit_at.getTime()).toBeLessThan(60_000)

      expect(await release(client, campus, ['building:B1'])).toEqual({ status: 'ok', released: ['building:B1'] })
      const denied = await saveFloor(client, campus, 'alice', 's1')
      expect(denied.status).toBe('zone_not_held')
      expect(denied.zones).toEqual([{ zoneKey: 'building:B1', holderName: null }])
    })
  })
})

describe('lock function privileges', () => {
  it('only navi_studio_api can execute the lock functions; the helper is private', async () => {
    await withTestDb(async (_client, admin) => {
      const { rows } = await admin.query<{ proname: string; public_exec: boolean; api_exec: boolean }>(
        `SELECT p.proname,
                has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
                has_function_privilege('navi_studio_api', p.oid, 'EXECUTE') AS api_exec
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'studio'
            AND p.proname IN ('acquire_zones','release_zones','status','force_release','lock_zone_keys')
          ORDER BY p.proname`,
      )
      expect(rows.map((r) => r.proname)).toEqual([
        'acquire_zones',
        'force_release',
        'lock_zone_keys',
        'release_zones',
        'status',
      ])
      for (const r of rows) {
        expect(r.public_exec, `${r.proname} PUBLIC`).toBe(false)
        expect(r.api_exec, `${r.proname} api`).toBe(r.proname !== 'lock_zone_keys')
      }
    })
  })
})
