// Browser client for the Save v2 Studio routes (/api/studio/v2/*).
// Type-only imports from the server module: no server code reaches the browser bundle.
import type { PartIssue } from '../parts/content-rules'
import { STUDIO_SESSION_HEADER } from '../parts/limits'
import type { PartKey, ZoneKey } from '../parts/part-keys'
import type {
  CampusRole,
  CampusRow,
  ChangesOk,
  LoadOk,
  OtherChangedPart,
  SavedPart,
  StalePart,
  ZoneDenial,
  ZoneLockView,
  ZoneNotHeld,
} from '../server/types'
import { studioSessionId } from './flag'

export type ClientSaveChange =
  | { partKey: PartKey; expectedVersion: number; op: 'put'; content: unknown; sortKey?: string | null }
  | { partKey: PartKey; expectedVersion: number; op: 'put-bin'; contentBase64: string }
  | { partKey: PartKey; expectedVersion: number; op: 'delete' }

export interface SaveRequestBody {
  campusId: string
  mutationId: string
  baseCommit: number
  message?: string
  changes: ClientSaveChange[]
}

/** The save route's answer, folded into the cases the SaveController acts on (R37). */
export type SaveHttpResult =
  | { status: 'ok' | 'replay'; commitNo: number | null; parts: SavedPart[]; othersChanged: OtherChangedPart[] }
  | { status: 'stale'; parts: StalePart[] }
  | { status: 'zone_not_held'; zones: ZoneNotHeld[] }
  | { status: 'invalid'; issues: PartIssue[] }
  | { status: 'offline'; message: string }
  | { status: 'failed'; code: string; message: string }

export interface StatusReply {
  headCommit: number
  locks: ZoneLockView[]
  lostZones: ZoneKey[]
  myRole: CampusRole
}

export class StudioApiError extends Error {
  constructor(readonly httpStatus: number, readonly code: string, message: string) {
    super(message)
    this.name = 'StudioApiError'
  }
}

export interface StudioApi {
  load(campusId: string): Promise<LoadOk>
  changesSince(campusId: string, since: number): Promise<ChangesOk>
  save(body: SaveRequestBody): Promise<SaveHttpResult>
  acquire(campusId: string, zones: ZoneKey[]): Promise<{ granted: ZoneKey[]; denied: ZoneDenial[] }>
  release(campusId: string, zones: ZoneKey[]): Promise<{ released: ZoneKey[] }>
  forceRelease(campusId: string, zone: ZoneKey): Promise<{ released: boolean }>
  status(campusId: string, held: ZoneKey[]): Promise<StatusReply>
  publish(campusId: string, commitNo: number): Promise<{ publicationNo: number; commitNo: number }>
  listCampuses(): Promise<CampusRow[]>
  createCampus(campusId: string, name: string, settings: Record<string, unknown>): Promise<void>
  updateCampus(campusId: string, name: string | null, settings: Record<string, unknown>): Promise<void>
  deleteCampus(campusId: string): Promise<void>
}

export interface StudioApiOptions {
  fetch?: typeof fetch
  sessionId?: () => string
  baseUrl?: string
}

type Json = Record<string, unknown>

async function readJson(response: Response): Promise<Json> {
  try {
    const value = (await response.json()) as unknown
    return value && typeof value === 'object' ? (value as Json) : {}
  } catch {
    // Non-JSON bodies (e.g. Vercel's plain-text 413) carry no code.
    return {}
  }
}

function errorOf(response: Response, body: Json): StudioApiError {
  const code = typeof body.code === 'string' ? body.code : `HTTP_${response.status}`
  const message = typeof body.message === 'string' ? body.message : code
  return new StudioApiError(response.status, code, message)
}

function isRetryable(response: Response, code: string): boolean {
  return response.status >= 500 && code !== 'SAVE_V2_NOT_CONFIGURED'
}

export function createStudioApi(options: StudioApiOptions = {}): StudioApi {
  const fetchImpl = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const sessionId = options.sessionId ?? studioSessionId
  const base = options.baseUrl ?? '/api/studio/v2'

  function request(path: string, init: { method: string; body?: unknown }): Promise<Response> {
    const headers: Record<string, string> = { [STUDIO_SESSION_HEADER]: sessionId() }
    if (init.body !== undefined) headers['content-type'] = 'application/json'
    return fetchImpl(`${base}${path}`, {
      method: init.method,
      headers,
      credentials: 'include',
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  }

  async function call<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    const response = await request(path, init)
    const body = await readJson(response)
    if (!response.ok) throw errorOf(response, body)
    return body as T
  }

  return {
    load: (campusId) =>
      call<Omit<LoadOk, 'status'>>(`/campus/${encodeURIComponent(campusId)}`, { method: 'GET' }).then((body) => ({ status: 'ok', ...body })),
    changesSince: (campusId, since) =>
      call<Omit<ChangesOk, 'status'>>(`/campus/${encodeURIComponent(campusId)}/changes?since=${since}`, { method: 'GET' }).then(
        (body) => ({ status: 'ok', ...body }),
      ),
    async save(body) {
      let response: Response
      try {
        response = await request('/save', { method: 'POST', body })
      } catch (error) {
        return { status: 'offline', message: error instanceof Error ? error.message : 'Network error' }
      }
      const reply = await readJson(response)
      const code = typeof reply.code === 'string' ? reply.code : `HTTP_${response.status}`
      if (response.ok) {
        return {
          status: reply.status === 'replay' ? 'replay' : 'ok',
          commitNo: (reply.commitNo as number | null) ?? null,
          parts: (reply.parts as SavedPart[]) ?? [],
          othersChanged: (reply.othersChanged as OtherChangedPart[]) ?? [],
        }
      }
      if (response.status === 409 && code === 'STALE_PART') return { status: 'stale', parts: (reply.parts as StalePart[]) ?? [] }
      if (response.status === 423) return { status: 'zone_not_held', zones: (reply.zones as ZoneNotHeld[]) ?? [] }
      if (response.status === 400 && Array.isArray(reply.details)) return { status: 'invalid', issues: reply.details as PartIssue[] }
      if (response.status === 413) return { status: 'failed', code: 'BODY_TOO_LARGE', message: 'The save is too large to send.' }
      if (isRetryable(response, code)) return { status: 'offline', message: `Server error ${response.status}` }
      return { status: 'failed', code, message: typeof reply.message === 'string' ? reply.message : code }
    },
    acquire: (campusId, zones) => call('/locks', { method: 'POST', body: { campusId, acquire: zones } }),
    release: (campusId, zones) => call('/locks', { method: 'POST', body: { campusId, release: zones } }),
    forceRelease: (campusId, zone) => call('/locks', { method: 'POST', body: { campusId, forceRelease: zone } }),
    status: (campusId, held) => call('/status', { method: 'POST', body: { campusId, held } }),
    publish: (campusId, commitNo) => call('/publish', { method: 'POST', body: { campusId, commitNo } }),
    listCampuses: () => call<{ campuses: CampusRow[] }>('/campuses', { method: 'GET' }).then((body) => body.campuses ?? []),
    createCampus: (campusId, name, settings) => call<unknown>('/campuses', { method: 'POST', body: { campusId, name, settings } }).then(() => undefined),
    updateCampus: (campusId, name, settings) =>
      call<unknown>('/campuses', { method: 'PATCH', body: { campusId, name, settings } }).then(() => undefined),
    deleteCampus: (campusId) =>
      call<unknown>(`/campuses?campus_id=${encodeURIComponent(campusId)}`, { method: 'DELETE' }).then(() => undefined),
  }
}
