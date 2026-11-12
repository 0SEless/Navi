// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { exportHash, readOldMap, readTrialTerrain } from '../read-sources'

/** A supabase-js style fake that records every builder method called. */
function fakeSupabase(rows: Record<string, Record<string, unknown> | null>) {
  const calls: string[] = []
  const client = {
    from(table: string) {
      calls.push(`from:${table}`)
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'order', 'limit']) {
        builder[method] = (..._args: unknown[]) => {
          calls.push(method)
          return builder
        }
      }
      builder.maybeSingle = async () => {
        calls.push('maybeSingle')
        return { data: rows[table] ?? null, error: null }
      }
      return builder
    },
  }
  return { client, calls }
}

const AUTHORED = { schemaVersion: 2, buildings: [], roads: [] }
const MAP_DATA = { name: 'NAVI – ASU Ibajay Campus', schoolName: 'ASU', center: { lat: 1, lng: 2 }, boundary: [{ lat: 1, lng: 2 }, { lat: 1, lng: 3 }, { lat: 2, lng: 3 }] }

describe('readOldMap', () => {
  it('returns the export and only ever reads', async () => {
    const { client, calls } = fakeSupabase({ graph_snapshots: { authored_document: AUTHORED }, campus_maps: { data: MAP_DATA } })
    const result = await readOldMap(client, 'map-map-1-repe')
    expect(result).toEqual({ campusId: 'map-map-1-repe', ...MAP_DATA, document: AUTHORED })
    const methods = new Set(calls.map((c) => c.split(':')[0]))
    expect([...methods].every((m) => ['from', 'select', 'eq', 'order', 'limit', 'maybeSingle'].includes(m))).toBe(true)
  })

  it('throws when the authored document is missing', async () => {
    const { client } = fakeSupabase({ graph_snapshots: null, campus_maps: { data: MAP_DATA } })
    await expect(readOldMap(client, 'map-map-1-repe')).rejects.toThrow('No authored document for map-map-1-repe')
  })

  it('throws when the campus map has no boundary', async () => {
    const { client } = fakeSupabase({ graph_snapshots: { authored_document: AUTHORED }, campus_maps: { data: { ...MAP_DATA, boundary: [] } } })
    await expect(readOldMap(client, 'map-map-1-repe')).rejects.toThrow('No boundary for map-map-1-repe')
  })
})

describe('readTrialTerrain', () => {
  it('maps rows to the terrain content and base64 tiles with a read-only query', async () => {
    const sql: string[] = []
    const db = {
      async query(text: string) {
        sql.push(text)
        return {
          rows: [
            { part_key: 'terrain', content: { terrain: { grid: { originLat: 1, originLng: 2 } } }, content_bin: null },
            { part_key: 'terrain-tile:0_0', content: null, content_bin: Buffer.from([1, 2, 3]) },
          ],
        }
      },
    }
    const result = await readTrialTerrain(db, 'map-map-5-0y27')
    expect(result).toEqual({
      campusId: 'map-map-5-0y27',
      terrain: { terrain: { grid: { originLat: 1, originLng: 2 } } },
      tiles: [{ tileId: '0_0', contentBase64: Buffer.from([1, 2, 3]).toString('base64') }],
    })
    expect(sql.join('\n')).not.toMatch(/\b(insert|update|delete)\b/i)
  })

  it('throws when the trial campus has no terrain part', async () => {
    const db = { async query() { return { rows: [] } } }
    await expect(readTrialTerrain(db, 'map-map-5-0y27')).rejects.toThrow('No terrain part for map-map-5-0y27')
  })
})

describe('exportHash', () => {
  it('is stable for the same input and changes when one byte changes', async () => {
    expect(await exportHash('a', 'b')).toBe(await exportHash('a', 'b'))
    expect(await exportHash('a', 'b')).not.toBe(await exportHash('a', 'c'))
  })
})
