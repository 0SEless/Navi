import { createServerClient } from '@supabase/ssr'

interface AuthoredDocumentRow {
  authored_document?: unknown
}

interface BuildingCoverQueryClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: AuthoredDocumentRow | null; error: unknown | null }>
      }
    }
  }
}

export type BuildingOwnershipResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'unavailable' }

export interface BuildingCoverRepositoryOptions {
  env?: Record<string, string | undefined>
  /** Test seam for the read-only service-role query. */
  createClient?: (url: string, serviceRoleKey: string) => BuildingCoverQueryClient
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Read the server-authored document only; this module has no write operations. */
export async function checkAuthoredBuildingOwnership(
  campusId: string,
  buildingId: string,
  options: BuildingCoverRepositoryOptions = {},
): Promise<BuildingOwnershipResult> {
  const env = options.env ?? process.env
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const serviceRoleKey = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!url || !serviceRoleKey || !campusId || !buildingId) return { ok: false, reason: 'unavailable' }

  try {
    const client = options.createClient
      ? options.createClient(url, serviceRoleKey)
      : createServerClient(url, serviceRoleKey, {
          cookies: { getAll: () => [], setAll: () => {} },
        }) as unknown as BuildingCoverQueryClient
    const { data, error } = await client
      .from('graph_snapshots')
      .select('authored_document')
      .eq('campus_id', campusId)
      .maybeSingle()
    if (error) return { ok: false, reason: 'unavailable' }
    if (!data || !isRecord(data.authored_document)) return { ok: false, reason: 'not_found' }

    const document = data.authored_document
    if (!isRecord(document.metadata) || document.metadata.campusId !== campusId || !Array.isArray(document.buildings)) {
      return { ok: false, reason: 'not_found' }
    }
    const found = document.buildings.some((building) => isRecord(building) && building.id === buildingId)
    return found ? { ok: true } : { ok: false, reason: 'not_found' }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}
