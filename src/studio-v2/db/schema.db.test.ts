import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { assertSaveV2TestTarget } from '../../../scripts/save-v2/db-target.mjs'
import { zoneOf } from '../parts/part-keys'
import { closeTestDb, resetStudioSchema, withTestDb } from './test-harness'

const STUDIO_TABLES = [
  'campuses',
  'members',
  'commits',
  'part_versions',
  'parts_current',
  'zone_locks',
  'milestones',
  'publications',
  'published_current',
  'mutation_receipts',
]

afterAll(async () => {
  await closeTestDb()
})

describe('studio schema', () => {
  it('navi_studio_api cannot SELECT studio.part_versions', async () => {
    await withTestDb(async (client) => {
      await client.query('SET ROLE navi_studio_api')
      try {
        await expect(client.query('SELECT * FROM studio.part_versions')).rejects.toThrow(/permission denied/)
      } finally {
        await client.query('RESET ROLE')
      }
    })
  })

  it('RLS is enabled on all studio tables', async () => {
    await withTestDb(async (_client, admin) => {
      const { rows } = await admin.query<{ relname: string; relrowsecurity: boolean }>(
        `SELECT c.relname, c.relrowsecurity
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'studio' AND c.relkind = 'r'
          ORDER BY c.relname`,
      )
      expect(rows.map((r) => r.relname).sort()).toEqual([...STUDIO_TABLES].sort())
      expect(rows.filter((r) => !r.relrowsecurity)).toEqual([])
      const policies = await admin.query(`SELECT 1 FROM pg_policies WHERE schemaname = 'studio'`)
      expect(policies.rows).toHaveLength(0)
    })
  })

  it('zone_of matches zoneOf for 12 sample keys', async () => {
    const keys = [
      'campus',
      'terrain',
      'terrain-tile:t1',
      'building:b1',
      'building:b%2F1',
      'building:%41bc',
      'building:%e2%82%ac',
      'floor:b1:f1',
      'floor:b%20x:f%3A1',
      'map/road:r1',
      'map/poi:p%2F1',
      'map/area:a1',
    ]
    expect(keys).toHaveLength(12)
    await withTestDb(async (client) => {
      for (const key of keys) {
        const { rows } = await client.query<{ zone: string | null }>('SELECT studio.zone_of($1) AS zone', [key])
        expect({ key, zone: rows[0].zone }).toEqual({ key, zone: zoneOf(key) })
      }
    })
  })

  it('zone_of raises on keys that zoneOf rejects', async () => {
    const bad = ['panorama:x', 'floor:onlyone', 'building:', 'campus:x', 'floor:a:b:c', 'map/road:', 'building:%ZZ', '']
    await withTestDb(async (client) => {
      for (const key of bad) {
        expect(() => zoneOf(key)).toThrow()
        await expect(client.query('SELECT studio.zone_of($1)', [key])).rejects.toThrow()
      }
    })
  })

  it('the migration can be applied twice in a row', async () => {
    await withTestDb(async (_client, admin) => {
      const sql = readFileSync(
        path.join(process.cwd(), 'supabase', 'migrations', '20261101000000_studio_v2.sql'),
        'utf8',
      )
      await admin.query(sql)
      await admin.query(sql)
      const { rows } = await admin.query(
        `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'studio'`,
      )
      expect(rows[0]).toEqual({ n: STUDIO_TABLES.length })
    })
  })

  it('part_versions enforces the content shape and checksum format', async () => {
    await withTestDb(async (_client, admin) => {
      await resetStudioSchema()
      await admin.query(`INSERT INTO studio.campuses (id, name) VALUES ('c1', 'C')`)
      await admin.query(
        `INSERT INTO studio.commits (campus_id, commit_no, author, mutation_id, kind) VALUES ('c1', 1, 'u', 'm1', 'save')`,
      )
      const sum = 'a'.repeat(64)
      let version = 0
      const insert = (content: string | null, deleted: boolean, checksum = sum) =>
        admin.query(
          `INSERT INTO studio.part_versions (campus_id, part_key, version_no, checksum, content, deleted, commit_no, size_bytes)
           VALUES ('c1', 'campus', $4, $3, $1::jsonb, $2, 1, 0)`,
          [content, deleted, checksum, ++version],
        )
      await insert('{}', false)
      await insert(null, true)
      await expect(insert(null, false)).rejects.toThrow(/content_shape/)
      await expect(insert('{}', true)).rejects.toThrow(/content_shape/)
      await expect(insert('{}', false, 'A'.repeat(64))).rejects.toThrow(/checksum/)
    })
  })
})

describe('test harness', () => {
  it('harness refuses port 5432', async () => {
    const fake = {
      host: '127.0.0.1',
      port: 5432,
      query: async () => {
        throw new Error('the guard must refuse before querying')
      },
    }
    await expect(assertSaveV2TestTarget(fake)).rejects.toThrow(/port/)
  })
})
