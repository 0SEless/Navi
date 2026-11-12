import { sha256Hex } from '@/studio-v2/parts/canonical'
import type { StudioQueryable } from '@/studio-v2/server/studio-repo'
import type { LatLngPoint, OldMapExport, TrialTerrainExport } from './types'

/** The slice of a supabase-js client the old-map reader uses: select queries only. */
export interface SelectOnlyClient {
  from(table: string): any
}

/** Reads the old authored document and campus-map settings from navi-development. Select only. */
export async function readOldMap(client: SelectOnlyClient, campusId: string): Promise<OldMapExport> {
  const snapshot = await client
    .from('graph_snapshots')
    .select('authored_document')
    .eq('campus_id', campusId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (snapshot.error) throw new Error(`Reading graph_snapshots failed: ${snapshot.error.message}`)
  const document = snapshot.data?.authored_document
  if (!document || typeof document !== 'object') throw new Error(`No authored document for ${campusId}`)

  const map = await client.from('campus_maps').select('data').eq('map_id', campusId).limit(1).maybeSingle()
  if (map.error) throw new Error(`Reading campus_maps failed: ${map.error.message}`)
  const data = (map.data?.data ?? {}) as Record<string, unknown>
  const boundary = data.boundary as LatLngPoint[] | undefined
  if (!Array.isArray(boundary) || boundary.length < 3) throw new Error(`No boundary for ${campusId}`)

  return {
    campusId,
    name: typeof data.name === 'string' ? data.name : campusId,
    schoolName: typeof data.schoolName === 'string' ? data.schoolName : null,
    center: data.center as LatLngPoint,
    boundary,
    document: document as Record<string, unknown>,
  }
}

const TRIAL_TERRAIN_SQL = `
SELECT pc.part_key, pv.content, pv.content_bin
FROM studio.parts_current pc
JOIN studio.part_versions pv
  ON pv.campus_id = pc.campus_id AND pv.part_key = pc.part_key AND pv.version_no = pc.version_no
WHERE pc.campus_id = $1
  AND (pc.part_key = 'terrain' OR pc.part_key LIKE 'terrain-tile:%')
  AND pv.deleted = false
ORDER BY pc.part_key`

/** Reads only the terrain part and tile parts of a Save v2 campus. */
export async function readTrialTerrain(db: StudioQueryable, campusId: string): Promise<TrialTerrainExport> {
  const { rows } = await db.query(TRIAL_TERRAIN_SQL, [campusId])
  const terrainRow = rows.find((r) => r.part_key === 'terrain')
  if (!terrainRow) throw new Error(`No terrain part for ${campusId}`)
  const tiles = rows
    .filter((r) => typeof r.part_key === 'string' && (r.part_key as string).startsWith('terrain-tile:'))
    .map((r) => ({
      tileId: (r.part_key as string).slice('terrain-tile:'.length),
      contentBase64: Buffer.from(r.content_bin as Uint8Array).toString('base64'),
    }))
  return { campusId, terrain: terrainRow.content as Record<string, unknown>, tiles }
}

/** Ties a dry-run report to the exact export files it checked. */
export function exportHash(oldJson: string, trialJson: string): Promise<string> {
  return sha256Hex(`${oldJson}\n${trialJson}`)
}
