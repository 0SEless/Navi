// HTTP handlers for the Save v2 Studio routes (spec 5.1 and 5.2).
//
// Each handler is a pure function of a standard Request (plus route params) that returns
// a standard Response. The route files under src/app/api/studio/v2 are thin wrappers:
// they hand the Next request to a handler built from the real repository and the real
// admin check. Tests build handlers from a fake repository and a fake verifier.
//
// Responsibilities here: authenticate (every endpoint), read the session header and the
// size-limited body, validate input, compute the part checksums on the server, and turn
// the database's status unions into HTTP statuses. Nothing here logs request bodies,
// part contents or secrets.
import { createHash } from 'node:crypto'
import { canonicalJson, sha256Hex } from '../parts/canonical'
import { checkPart, STUDIO_PART_MAX_BYTES, type PartIssue } from '../parts/content-rules'
import { parsePartKey } from '../parts/part-keys'
import type { StudioRepo } from './studio-repo'
import type { SaveChange, SaveInput } from './types'

export const STUDIO_SESSION_HEADER = 'x-navi-studio-session'
export const STUDIO_BODY_MAX_BYTES = 8 * 1024 * 1024

const SESSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MUTATION_CONSTRAINT = 'commits_campus_id_mutation_id_key'
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

/** What the handlers need from the admin check; verifyMutationPrincipal's result satisfies it. */
export type VerifiedPrincipalResult =
  | { ok: true; principal: { id: string; email: string | null; role: string; method: string } }
  | { ok: false; response: Response }

export interface StudioHandlerDeps {
  repo: StudioRepo
  verifyPrincipal: (request: Request) => Promise<VerifiedPrincipalResult>
}

type AnyRecord = Record<string, unknown>
type Principal = Extract<VerifiedPrincipalResult, { ok: true }>['principal']

interface Actor {
  id: string
  name: string
  isSuperAdmin: boolean
}

/** A failure that is already an HTTP response. */
class HttpError extends Error {
  constructor(readonly response: Response) {
    super('http')
  }
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status })
}

function fail(status: number, code: string, extra: AnyRecord = {}): never {
  throw new HttpError(json(status, { code, ...extra }))
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function actorOf(principal: Principal): Actor {
  const email = typeof principal.email === 'string' ? principal.email : ''
  const at = email.indexOf('@')
  const local = at > 0 ? email.slice(0, at) : at === -1 ? email : ''
  return { id: principal.id, name: local || principal.id, isSuperAdmin: principal.role === 'super_admin' }
}

function validCampusId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
  )
}

function requireCampusId(value: unknown): string {
  if (!validCampusId(value)) fail(400, 'INVALID_REQUEST', { message: 'campusId is missing or malformed.' })
  return value
}

function requireSession(request: Request): string {
  const session = request.headers.get(STUDIO_SESSION_HEADER)
  if (!session || !SESSION_PATTERN.test(session)) {
    fail(400, 'SESSION_REQUIRED', { message: `Header ${STUDIO_SESSION_HEADER} must be a UUID.` })
  }
  return session
}

async function readBody(request: Request): Promise<AnyRecord> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > STUDIO_BODY_MAX_BYTES) fail(413, 'BODY_TOO_LARGE')
  const text = await request.text()
  if (Buffer.byteLength(text, 'utf8') > STUDIO_BODY_MAX_BYTES) fail(413, 'BODY_TOO_LARGE')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return fail(400, 'INVALID_JSON')
  }
  if (!isRecord(parsed)) fail(400, 'INVALID_REQUEST', { message: 'The request body must be a JSON object.' })
  return parsed
}

function errorCodeOf(error: unknown): { code?: unknown; constraint?: unknown; message?: unknown } {
  return typeof error === 'object' && error !== null ? (error as AnyRecord) : {}
}

/** Maps a thrown value to a response. Logs a code only, never messages with payloads. */
function responseForError(error: unknown, route: string): Response {
  if (error instanceof HttpError) return error.response
  const info = errorCodeOf(error)
  const message = typeof info.message === 'string' ? info.message : ''
  if (message.includes('NAVI_STUDIO_DATABASE_URL is not set')) {
    return json(503, {
      code: 'SAVE_V2_NOT_CONFIGURED',
      message: 'NAVI_STUDIO_DATABASE_URL is not configured.',
    })
  }
  if (info.code === '22023') {
    return json(400, { code: 'INVALID_REQUEST', message })
  }
  if (info.code === '23505' && info.constraint === MUTATION_CONSTRAINT) {
    return json(409, { code: 'MUTATION_ID_COLLISION' })
  }
  console.error('[studio-v2]', route, typeof info.code === 'string' ? info.code : 'unexpected error')
  return json(500, { code: 'INTERNAL' })
}

function sha256OfBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

interface RawChange {
  partKey: string
  expectedVersion: number
  op: 'put' | 'put-bin' | 'delete'
  content?: unknown
  contentBase64?: unknown
  sortKey?: unknown
}

function parseChanges(raw: unknown): RawChange[] {
  if (!Array.isArray(raw)) fail(400, 'INVALID_REQUEST', { message: 'changes must be an array.' })
  return raw.map((entry, index) => {
    if (!isRecord(entry)) fail(400, 'INVALID_REQUEST', { message: `change ${index} is not an object.` })
    if (typeof entry.partKey !== 'string' || entry.partKey === '') {
      fail(400, 'INVALID_REQUEST', { message: `change ${index} has no partKey.` })
    }
    if (!Number.isInteger(entry.expectedVersion) || (entry.expectedVersion as number) < 0) {
      fail(400, 'INVALID_REQUEST', { message: `change ${index} needs expectedVersion as a non-negative integer.` })
    }
    if (entry.op !== 'put' && entry.op !== 'put-bin' && entry.op !== 'delete') {
      fail(400, 'INVALID_REQUEST', { message: `change ${index} has an unknown op.` })
    }
    if (entry.sortKey !== undefined && entry.sortKey !== null && typeof entry.sortKey !== 'string') {
      fail(400, 'INVALID_REQUEST', { message: `change ${index} has a sortKey that is not a string.` })
    }
    return entry as unknown as RawChange
  })
}

/** Validates every change and builds the server-checksummed changes for studio.save. */
async function buildSaveChanges(raw: RawChange[]): Promise<SaveChange[]> {
  const issues: PartIssue[] = []
  const built: SaveChange[] = []

  for (const change of raw) {
    const base = {
      partKey: change.partKey,
      expectedVersion: change.expectedVersion,
      ...(typeof change.sortKey === 'string' ? { sortKey: change.sortKey } : {}),
    }

    if (change.op === 'delete') {
      built.push({ ...base, op: 'delete' })
      continue
    }

    if (change.op === 'put') {
      if (change.content === undefined) {
        issues.push({ key: change.partKey, code: 'INVALID_PART', path: '/content', message: 'A put needs content.' })
        continue
      }
      const found = checkPart({
        key: change.partKey,
        content: change.content,
        sortKey: typeof change.sortKey === 'string' ? change.sortKey : null,
      })
      issues.push(...found)
      if (change.partKey.startsWith('map/') && typeof change.sortKey !== 'string') {
        issues.push({
          key: change.partKey,
          code: 'INVALID_PART',
          path: '/sortKey',
          message: 'A map item needs a sortKey; without it the item order would be lost.',
        })
      }
      if (found.length === 0) {
        const text = canonicalJson(change.content)
        built.push({
          ...base,
          op: 'put',
          content: change.content,
          checksum: await sha256Hex(text),
          sizeBytes: Buffer.byteLength(text, 'utf8'),
        })
      }
      continue
    }

    // put-bin
    try {
      parsePartKey(change.partKey)
    } catch (error) {
      issues.push({
        key: change.partKey,
        code: 'UNKNOWN_PART_KIND',
        path: '',
        message: error instanceof Error ? error.message : 'Unknown part key.',
      })
      continue
    }
    const encoded = change.contentBase64
    if (typeof encoded !== 'string' || encoded.length % 4 !== 0 || !BASE64_PATTERN.test(encoded)) {
      issues.push({
        key: change.partKey,
        code: 'INVALID_PART',
        path: '/contentBase64',
        message: 'A put-bin needs contentBase64 as a base64 string.',
      })
      continue
    }
    const bytes = Buffer.from(encoded, 'base64')
    if (bytes.length > STUDIO_PART_MAX_BYTES) {
      issues.push({
        key: change.partKey,
        code: 'TOO_LARGE',
        path: '',
        message: `Part is ${bytes.length} bytes; the maximum is ${STUDIO_PART_MAX_BYTES}.`,
      })
      continue
    }
    built.push({ ...base, op: 'put-bin', contentBase64: encoded, checksum: sha256OfBytes(bytes) })
  }

  if (issues.length > 0) fail(400, issues[0].code, { details: issues })
  return built
}

export function createStudioHandlers(deps: StudioHandlerDeps) {
  const { repo, verifyPrincipal } = deps

  /** Runs `work` after the admin check; every thrown failure becomes a response. */
  async function guarded(
    route: string,
    request: Request,
    work: (actor: Actor) => Promise<Response>,
  ): Promise<Response> {
    try {
      const verified = await verifyPrincipal(request)
      if (!verified.ok) return verified.response
      return await work(actorOf(verified.principal))
    } catch (error) {
      return responseForError(error, route)
    }
  }

  return {
    // GET /api/studio/v2/campuses
    listCampuses(request: Request): Promise<Response> {
      return guarded('campuses.list', request, async () => {
        const result = await repo.listCampuses()
        return json(200, { campuses: result.campuses })
      })
    },

    // POST /api/studio/v2/campuses { campusId, name, settings? }
    createCampus(request: Request): Promise<Response> {
      return guarded('campuses.create', request, async (actor) => {
        const body = await readBody(request)
        const campusId = requireCampusId(body.campusId)
        if (typeof body.name !== 'string' || body.name.trim() === '') {
          fail(400, 'INVALID_REQUEST', { message: 'name is required.' })
        }
        if (body.settings !== undefined && !isRecord(body.settings)) {
          fail(400, 'INVALID_REQUEST', { message: 'settings must be an object.' })
        }
        const result = await repo.createCampus(campusId, body.name, actor.id, (body.settings as AnyRecord) ?? {})
        if (result.status === 'exists') return json(409, { code: 'CAMPUS_EXISTS' })
        return json(201, { campusId: result.campusId })
      })
    },

    // PATCH /api/studio/v2/campuses { campusId, name?, settings }
    updateCampus(request: Request): Promise<Response> {
      return guarded('campuses.update', request, async (actor) => {
        const body = await readBody(request)
        const campusId = requireCampusId(body.campusId)
        if (body.name !== undefined && body.name !== null && typeof body.name !== 'string') {
          fail(400, 'INVALID_REQUEST', { message: 'name must be a string.' })
        }
        if (!isRecord(body.settings)) fail(400, 'INVALID_REQUEST', { message: 'settings must be an object.' })
        const result = await repo.updateCampusSettings(
          campusId,
          actor.id,
          typeof body.name === 'string' ? body.name : null,
          body.settings,
        )
        if (result.status === 'forbidden') return json(403, { code: 'FORBIDDEN' })
        if (result.status === 'campus_not_found') return json(404, { code: 'CAMPUS_NOT_FOUND' })
        return json(200, { campusId })
      })
    },

    // DELETE /api/studio/v2/campuses?campus_id=
    deleteCampus(request: Request): Promise<Response> {
      return guarded('campuses.delete', request, async (actor) => {
        const campusId = requireCampusId(new URL(request.url).searchParams.get('campus_id'))
        const result = await repo.deleteCampus(campusId, actor.id, actor.isSuperAdmin)
        if (result.status === 'forbidden') return json(403, { code: 'FORBIDDEN' })
        if (result.status === 'campus_not_found') return json(404, { code: 'CAMPUS_NOT_FOUND' })
        return json(200, { campusId })
      })
    },

    // GET /api/studio/v2/campus/[id]
    load(request: Request, params: { id: string }): Promise<Response> {
      return guarded('campus.load', request, async () => {
        const campusId = requireCampusId(params.id)
        const result = await repo.load(campusId)
        if (result.status === 'campus_not_found') return json(404, { code: 'CAMPUS_NOT_FOUND' })
        return json(200, { headCommit: result.headCommit, parts: result.parts })
      })
    },

    // GET /api/studio/v2/campus/[id]/changes?since=<int >= 0>
    changes(request: Request, params: { id: string }): Promise<Response> {
      return guarded('campus.changes', request, async () => {
        const campusId = requireCampusId(params.id)
        const rawSince = new URL(request.url).searchParams.get('since')
        if (rawSince === null || !/^\d{1,15}$/.test(rawSince)) {
          fail(400, 'INVALID_REQUEST', { message: 'since must be a non-negative integer.' })
        }
        const result = await repo.changesSince(campusId, Number(rawSince))
        if (result.status === 'campus_not_found') return json(404, { code: 'CAMPUS_NOT_FOUND' })
        return json(200, { headCommit: result.headCommit, parts: result.parts })
      })
    },

    // POST /api/studio/v2/save
    save(request: Request): Promise<Response> {
      return guarded('save', request, async (actor) => {
        const session = requireSession(request)
        const body = await readBody(request)
        const campusId = requireCampusId(body.campusId)
        if (typeof body.mutationId !== 'string' || body.mutationId === '') {
          fail(400, 'INVALID_REQUEST', { message: 'mutationId is required.' })
        }
        if (!Number.isInteger(body.baseCommit) || (body.baseCommit as number) < 0) {
          fail(400, 'INVALID_REQUEST', { message: 'baseCommit must be a non-negative integer.' })
        }
        if (body.message !== undefined && body.message !== null && typeof body.message !== 'string') {
          fail(400, 'INVALID_REQUEST', { message: 'message must be a string.' })
        }
        const rawChanges = parseChanges(body.changes)
        const changes = await buildSaveChanges(rawChanges)

        const input: SaveInput = {
          campusId,
          actor: actor.id,
          session,
          mutationId: body.mutationId,
          baseCommit: body.baseCommit as number,
          message: typeof body.message === 'string' ? body.message : null,
          changes,
          // R15: the retry fingerprint covers who asked, what base, and the changes as sent.
          requestChecksum: await sha256Hex(
            canonicalJson({ actor: actor.id, baseCommit: body.baseCommit, changes: body.changes }),
          ),
        }
        const result = await repo.save(input)
        switch (result.status) {
          case 'ok':
          case 'replay':
            return json(200, {
              status: result.status,
              commitNo: result.commitNo,
              parts: result.parts,
              othersChanged: result.othersChanged,
            })
          case 'stale':
            return json(409, { code: 'STALE_PART', parts: result.parts })
          case 'zone_not_held':
            return json(423, { code: 'ZONE_NOT_HELD', zones: result.zones })
          case 'mutation_collision':
            return json(409, { code: 'MUTATION_ID_COLLISION' })
          case 'forbidden':
            return json(403, { code: 'FORBIDDEN' })
          case 'campus_not_found':
            return json(404, { code: 'CAMPUS_NOT_FOUND' })
        }
      })
    },

    // POST /api/studio/v2/locks { campusId, acquire | release | forceRelease }
    locks(request: Request): Promise<Response> {
      return guarded('locks', request, async (actor) => {
        const session = requireSession(request)
        const body = await readBody(request)
        const campusId = requireCampusId(body.campusId)
        const present = (['acquire', 'release', 'forceRelease'] as const).filter((key) => body[key] !== undefined)
        if (present.length !== 1) {
          fail(400, 'INVALID_REQUEST', { message: 'Send exactly one of acquire, release or forceRelease.' })
        }
        const action = present[0]

        if (action === 'forceRelease') {
          if (typeof body.forceRelease !== 'string' || body.forceRelease === '') {
            fail(400, 'INVALID_REQUEST', { message: 'forceRelease must be a zone key.' })
          }
          const result = await repo.forceRelease(campusId, actor.id, body.forceRelease, actor.isSuperAdmin)
          if (result.status === 'forbidden') return json(403, { code: 'FORBIDDEN' })
          if (result.status === 'campus_not_found') return json(404, { code: 'CAMPUS_NOT_FOUND' })
          return json(200, { released: result.released })
        }

        const zones = body[action]
        if (!Array.isArray(zones) || !zones.every((zone) => typeof zone === 'string')) {
          fail(400, 'INVALID_REQUEST', { message: `${action} must be an array of zone keys.` })
        }
        if (action === 'acquire') {
          const result = await repo.acquireZones(campusId, actor.id, actor.name, session, zones as string[])
          if (result.status === 'forbidden') return json(403, { code: 'FORBIDDEN' })
          if (result.status === 'campus_not_found') return json(404, { code: 'CAMPUS_NOT_FOUND' })
          return json(200, { granted: result.granted, denied: result.denied })
        }
        const result = await repo.releaseZones(campusId, actor.id, session, zones as string[])
        if (result.status === 'campus_not_found') return json(404, { code: 'CAMPUS_NOT_FOUND' })
        return json(200, { released: result.released })
      })
    },

    // POST /api/studio/v2/status { campusId, held }
    status(request: Request): Promise<Response> {
      return guarded('status', request, async (actor) => {
        const session = requireSession(request)
        const body = await readBody(request)
        const campusId = requireCampusId(body.campusId)
        if (!Array.isArray(body.held) || !body.held.every((zone) => typeof zone === 'string')) {
          fail(400, 'INVALID_REQUEST', { message: 'held must be an array of zone keys.' })
        }
        const result = await repo.status(campusId, actor.id, session, body.held as string[])
        if (result.status === 'campus_not_found') return json(404, { code: 'CAMPUS_NOT_FOUND' })
        const myRole = actor.isSuperAdmin ? 'owner' : await repo.roleOf(campusId, actor.id)
        if (myRole === null) return json(404, { code: 'CAMPUS_NOT_FOUND' })
        return json(200, {
          headCommit: result.headCommit,
          locks: result.locks,
          lostZones: result.lostZones,
          myRole,
        })
      })
    },
  }
}

export type StudioHandlers = ReturnType<typeof createStudioHandlers>
