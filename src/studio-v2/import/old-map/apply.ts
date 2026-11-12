import { STUDIO_SESSION_HEADER } from '@/studio-v2/parts/limits'
import { zoneOf } from '@/studio-v2/parts/part-keys'
import type { PartRecord } from '@/studio-v2/parts/split'
import type { createStudioHandlers } from '@/studio-v2/server/handlers'

type Handlers = ReturnType<typeof createStudioHandlers>
type Stage = 'create' | 'locks' | 'save' | 'readback'

export type ApplyResult =
  | { ok: true; commit: number; savedParts: number }
  | { ok: false; stage: Stage; status: number; body: unknown; createdEmptyCampus: boolean }

export interface ApplyInput {
  handlers: Handlers
  campusId: string
  name: string
  settings: Record<string, unknown>
  parts: PartRecord[]
  message: string
}

function post(body: unknown, session?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (session) headers[STUDIO_SESSION_HEADER] = session
  return new Request('http://local/import', { method: 'POST', headers, body: JSON.stringify(body) })
}

async function read(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Creates the campus and saves every part in one Studio save, through the same handlers
 * Studio uses (validation, server checksums, zone locks). Never overwrites a campus.
 */
export async function applyImport(input: ApplyInput): Promise<ApplyResult> {
  const { handlers, campusId, parts } = input
  const stop = async (stage: Stage, response: Response, createdEmptyCampus: boolean): Promise<ApplyResult> => ({
    ok: false,
    stage,
    status: response.status,
    body: await read(response),
    createdEmptyCampus,
  })

  const created = await handlers.createCampus(post({ campusId, name: input.name, settings: input.settings }))
  if (!created.ok) return stop('create', created, false)

  const session = crypto.randomUUID()
  const zones = [...new Set(parts.map((p) => zoneOf(p.key)).filter((z): z is string => z !== null))]
  try {
    const locked = await handlers.locks(post({ campusId, acquire: zones }, session))
    const lockBody = (await read(locked.clone())) as { denied?: unknown[] } | null
    if (!locked.ok || (lockBody?.denied?.length ?? 0) > 0) return stop('locks', locked, true)

    const changes = parts.map((p) =>
      p.contentBase64 !== undefined
        ? { partKey: p.key, expectedVersion: 0, op: 'put-bin', contentBase64: p.contentBase64 }
        : { partKey: p.key, expectedVersion: 0, op: 'put', content: p.content, sortKey: p.sortKey },
    )
    const saved = await handlers.save(
      post({ campusId, mutationId: crypto.randomUUID(), baseCommit: 0, message: input.message, changes }, session),
    )
    if (!saved.ok) return stop('save', saved, true)
    const saveBody = (await read(saved)) as { commitNo: number | null }

    const loaded = await handlers.load(post({}), { id: campusId })
    const loadBody = (await read(loaded.clone())) as { parts?: Array<{ partKey: string }> } | null
    const loadedKeys = new Set((loadBody?.parts ?? []).map((p) => p.partKey))
    if (!loaded.ok || loadedKeys.size !== parts.length || parts.some((p) => !loadedKeys.has(p.key))) {
      return stop('readback', loaded, false)
    }
    return { ok: true, commit: saveBody.commitNo ?? 0, savedParts: parts.length }
  } finally {
    if (zones.length > 0) await handlers.locks(post({ campusId, release: zones }, session))
  }
}
