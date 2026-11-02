import { afterAll, describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import type { Queryable } from 'pg'
import { closeTestDb, withTestDb, type TestDbClient } from './test-harness'

// Terrain tiles with negative indexes, the new structure part kinds, and the
// lock rule that stairs (free) and building pads (building zone) never need
// the terrain lock.

afterAll(async () => {
  await closeTestDb()
})

const sha = (text: string | Buffer) => createHash('sha256').update(text).digest('hex')

function put(partKey: string, content: unknown, sortKey?: string) {
  const text = JSON.stringify(content)
  return { partKey, expectedVersion: 0, op: 'put', checksum: sha(text), content, sizeBytes: Buffer.byteLength(text), ...(sortKey ? { sortKey } : {}) }
}

function putBin(partKey: string, bytes: Buffer) {
  return { partKey, expectedVersion: 0, op: 'put-bin', checksum: sha(bytes), contentBase64: bytes.toString('base64'), sizeBytes: bytes.length }
}

let seq = 0
async function newCampus(admin: TestDbClient): Promise<string> {
  const id = `terrain-${++seq}-${randomUUID().slice(0, 8)}`
  await admin.query(`INSERT INTO studio.campuses (id, name, created_by) VALUES ($1, 'Test campus', 'alice')`, [id])
  return id
}

async function lockZone(admin: TestDbClient, campus: string, zoneKey: string, holder: string, sessionId: string) {
  await admin.query(
    `INSERT INTO studio.zone_locks (campus_id, zone_key, holder, holder_name, session_id, heartbeat_at, last_edit_at)
     VALUES ($1, $2, $3, $3, $4, now(), now())`,
    [campus, zoneKey, holder, sessionId],
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function save(db: Queryable, campus: string, actor: string, session: string, changes: unknown[]): Promise<any> {
  const changesJson = JSON.stringify(changes)
  const { rows } = await db.query(
    `SELECT studio.save($1, $2, $3, $4, $5, $6, $7::jsonb, $8) AS r`,
    [campus, actor, session, randomUUID(), 0, 'test', changesJson, sha(changesJson)],
  )
  return rows[0].r
}

describe('terrain tiles and structure parts', () => {
  it('terrain-tile:-1_0 saves and loads', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await lockZone(admin, campus, 'terrain', 'alice', 's1')
      const bytes = Buffer.alloc(32768, 3)
      const result = await save(client, campus, 'alice', 's1', [putBin('terrain-tile:-1_0', bytes)])
      expect(result).toMatchObject({ status: 'ok', parts: [{ partKey: 'terrain-tile:-1_0', versionNo: 1 }] })
      const { rows } = await admin.query(
        `SELECT pv.content_bin FROM studio.parts_current pc
           JOIN studio.part_versions pv USING (campus_id, part_key, version_no)
          WHERE pc.campus_id = $1 AND pc.part_key = 'terrain-tile:-1_0'`,
        [campus],
      )
      expect(Buffer.compare(rows[0].content_bin as Buffer, bytes)).toBe(0)
    })
  })

  it('structure and building pad save without terrain lock', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      await lockZone(admin, campus, 'terrain', 'alice', 's1')
      await lockZone(admin, campus, 'building:b1', 'bob', 's2')
      const result = await save(client, campus, 'bob', 's2', [
        put('map/structure:s1', { id: 's1', form: 'stairs' }, '000000'),
        put('building:b1', { building: { id: 'b1', ground: { baseMode: 'follow-ground', pad: { mode: 'both', blendMeters: 3 } } }, floorOrder: [], qrCheckpoints: [], qrSortKeys: [] }, '000000'),
      ])
      expect(result.status).toBe('ok')
    })
  })

  it('map/structure-preset key is accepted after the migration', async () => {
    await withTestDb(async (client, admin) => {
      const campus = await newCampus(admin)
      const result = await save(client, campus, 'alice', 's1', [put('map/structure-preset:p1', { id: 'p1' }, '000000')])
      expect(result).toMatchObject({ status: 'ok', parts: [{ partKey: 'map/structure-preset:p1', versionNo: 1 }] })
    })
  })
})
