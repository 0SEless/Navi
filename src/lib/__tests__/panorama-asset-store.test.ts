import { describe, expect, it } from 'vitest'
import {
  findPanoramaAssets,
  type AssetStoreClient,
} from '@/lib/panorama-asset-store'

const ASSET_A = 'panoramas/campus-a/panorama-a.jpg'
const ASSET_B = 'panoramas/campus-a/panorama-b.webp'

type RegistryRow = {
  key: string
  campus_id: string
  panorama_id: string
  content_type: string
  byte_size: number
  status: string
}

function makeClient(rows: RegistryRow[], error: { message: string } | null = null) {
  const calls = { table: [] as string[], columns: [] as string[], filters: [] as Array<{ column: string; values: string[] }> }
  const client = {
    from(table: string) {
      calls.table.push(table)
      return {
        select(columns: string) {
          calls.columns.push(columns)
          return {
            async in(column: string, values: string[]) {
              calls.filters.push({ column, values })
              return {
                data: rows.filter(row => values.includes(row.key)),
                error,
              }
            },
          }
        },
      }
    },
  } as unknown as AssetStoreClient
  return { client, calls }
}

describe('findPanoramaAssets', () => {
  it('loads unique keys in one query and returns mapped records for rows found', async () => {
    const row: RegistryRow = {
      key: ASSET_A,
      campus_id: 'campus-a',
      panorama_id: 'panorama-a',
      content_type: 'image/jpeg',
      byte_size: 2048,
      status: 'uploaded',
    }
    const { client, calls } = makeClient([row])

    const assets = await findPanoramaAssets(client, [ASSET_A, ASSET_A, ASSET_B])

    expect(calls).toEqual({
      table: ['panorama_assets'],
      columns: ['key, campus_id, panorama_id, content_type, byte_size, status'],
      filters: [{ column: 'key', values: [ASSET_A, ASSET_B] }],
    })
    expect(assets.get(ASSET_A)).toEqual({
      key: ASSET_A,
      campusId: 'campus-a',
      panoramaId: 'panorama-a',
      contentType: 'image/jpeg',
      byteSize: 2048,
      status: 'uploaded',
    })
    expect(assets.has(ASSET_B)).toBe(false)
  })

  it('returns an empty map without querying for an empty key list', async () => {
    const { client, calls } = makeClient([])

    const assets = await findPanoramaAssets(client, [])

    expect(assets.size).toBe(0)
    expect(calls.table).toEqual([])
  })

  it('surfaces registry failures to the caller', async () => {
    const { client, calls } = makeClient([], { message: 'registry_read_failed' })

    await expect(findPanoramaAssets(client, [ASSET_A])).rejects.toThrow('registry_read_failed')
    expect(calls.table).toEqual(['panorama_assets'])
  })
})
