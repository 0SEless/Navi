import {
  commitScopedBatch,
  commitScopedCandidate,
  createScopedSaveCandidate,
  scopedContentChecksum,
  ScopedCommitError,
  type ScopedSaveKind,
  type ScopedSaveScope,
} from './scoped-campus-save'
import { InMemoryScopedCommitStore } from './scoped-campus-history.local'
import { isStudioScopedHistoryEnabled } from './studio-scoped-history-flag'

interface SeedScope {
  scope: ScopedSaveScope
  content: unknown
}

interface DevSession {
  campusId: string
  documentId: string
  store: InMemoryScopedCommitStore
  requestReceipts: Map<string, { signature: string; response: JsonRecord }>
}

export interface ScopedHistoryDevRuntime {
  sessions: Map<string, DevSession>
  stores: Map<string, InMemoryScopedCommitStore>
}

type RequestEnvironment = Record<string, string | undefined>
type JsonRecord = Record<string, unknown>

const ALLOWED_SCOPE_KINDS: ScopedSaveKind[] = ['building', 'routing', 'terrain', 'campus-settings']

export function createScopedHistoryRuntime(): ScopedHistoryDevRuntime {
  return { sessions: new Map(), stores: new Map() }
}

function getRuntime(): ScopedHistoryDevRuntime {
  const root = globalThis as typeof globalThis & { __naviScopedHistoryRuntime?: ScopedHistoryDevRuntime }
  root.__naviScopedHistoryRuntime ??= createScopedHistoryRuntime()
  return root.__naviScopedHistoryRuntime
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function validIdentity(value: unknown, maxLength = 160): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && value === value.trim()
}

function validScope(value: unknown): value is ScopedSaveScope {
  const entry = asRecord(value)
  return Boolean(
    entry && ALLOWED_SCOPE_KINDS.includes(entry.kind as ScopedSaveKind) && validIdentity(entry.id, 256),
  )
}

function hostname(value: string | null): string | null {
  if (!value) return null
  const input = value.trim().toLowerCase()
  if (input.startsWith('[')) {
    const end = input.indexOf(']')
    return end < 0 ? null : input.slice(1, end)
  }
  return input.split(':')[0] || null
}

function isLoopback(host: string | null): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function isLoopbackRequest(request: Request): boolean {
  const requestHost = hostname(request.headers.get('host'))
  if (!isLoopback(requestHost)) return false
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    const parsedOrigin = new URL(origin)
    return isLoopback(parsedOrigin.hostname.toLowerCase()) && parsedOrigin.hostname.toLowerCase() === requestHost
  } catch {
    return false
  }
}

function enabled(env: RequestEnvironment): boolean {
  return isStudioScopedHistoryEnabled({
    nodeEnv: env.NODE_ENV,
    scopedFlag: env.NEXT_PUBLIC_NAVI_STUDIO_SCOPED_HISTORY,
    draftFlag: env.NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS,
  })
}

function stateFor(session: DevSession, campusId: string) {
  const state = session.store.readCampusState(campusId)
  return state
}

function errorResponse(error: unknown): Response {
  if (error instanceof ScopedCommitError) {
    const status = ['STALE_REVISION', 'DEPENDENCY_CONFLICT', 'DEPENDENCY_MISSING', 'MUTATION_ID_REUSED'].includes(error.code) ? 409 : 400
    return json({ ok: false, localOnly: true, code: error.code, message: error.message }, status)
  }
  return json({ ok: false, localOnly: true, code: 'INVALID_LOCAL_OPERATION', message: error instanceof Error ? error.message : 'Local scoped operation failed.' }, 400)
}

/** Development-only request handler; it never imports or calls a cloud service. */
export async function handleScopedHistoryRequest(
  request: Request,
  env: RequestEnvironment = process.env,
  runtime: ScopedHistoryDevRuntime = getRuntime(),
): Promise<Response> {
  if (!enabled(env)) return json({ ok: false, localOnly: true, code: 'DISABLED' }, 404)
  if (!isLoopbackRequest(request)) return json({ ok: false, localOnly: true, code: 'LOOPBACK_ONLY' }, 403)
  if (request.method !== 'POST') return json({ ok: false, localOnly: true, code: 'METHOD_NOT_ALLOWED' }, 405)

  let payload: JsonRecord | null
  try {
    payload = asRecord(await request.json())
  } catch {
    payload = null
  }
  if (!payload) return json({ ok: false, localOnly: true, code: 'INVALID_REQUEST' }, 400)

  const sessionId = payload.sessionId
  const campusId = payload.campusId
  const documentId = payload.documentId
  if (!validIdentity(sessionId) || !validIdentity(campusId, 256) || documentId !== `campus:${campusId}`) {
    return json({ ok: false, localOnly: true, code: 'INVALID_IDENTITY' }, 400)
  }

  if (payload.type === 'initialize') {
    if (!Array.isArray(payload.baseline) || payload.baseline.length > 2000) {
      return json({ ok: false, localOnly: true, code: 'INVALID_BASELINE' }, 400)
    }
    const existing = runtime.sessions.get(sessionId)
    if (existing) {
      if (existing.campusId !== campusId || existing.documentId !== documentId) {
        return json({ ok: false, localOnly: true, code: 'SESSION_IDENTITY_MISMATCH' }, 409)
      }
      const state = await stateFor(existing, campusId)
      return json({ ok: true, localOnly: true, localRevision: state.revision, scopes: state.scopes }, 200)
    }
    const seen = new Set<string>()
    const baseline: SeedScope[] = []
    for (const entryValue of payload.baseline) {
      const entry = asRecord(entryValue)
      if (!entry || !validScope(entry.scope)) return json({ ok: false, localOnly: true, code: 'INVALID_BASELINE' }, 400)
      const key = `${entry.scope.kind}:${entry.scope.id}`
      if (seen.has(key)) return json({ ok: false, localOnly: true, code: 'DUPLICATE_BASELINE_SCOPE' }, 400)
      seen.add(key)
      baseline.push({ scope: entry.scope, content: entry.content })
    }
    let store = runtime.stores.get(campusId)
    if (store) {
      const current = await store.readCampusState(campusId)
      const incoming = new Map(baseline.map(({ scope, content }) => [`${scope.kind}:${scope.id}`, scopedContentChecksum(content)]))
      const currentKeys = Object.keys(current.scopes)
      const matchesCurrent = incoming.size === currentKeys.length && currentKeys.every((key) =>
        incoming.get(key) === current.scopes[key].contentChecksum,
      )
      if (!matchesCurrent) {
        return json({
          ok: false,
          localOnly: true,
          code: 'STALE_BASELINE',
          message: 'This editor document differs from the current local campus revision; reload or recover its draft before saving.',
          localRevision: current.revision,
        }, 409)
      }
    } else {
      while (runtime.stores.size >= 32) {
        const oldestCampusId = runtime.stores.keys().next().value
        if (!oldestCampusId) break
        runtime.stores.delete(oldestCampusId)
        for (const [existingSessionId, existingSession] of runtime.sessions) {
          if (existingSession.campusId === oldestCampusId) runtime.sessions.delete(existingSessionId)
        }
      }
      store = new InMemoryScopedCommitStore()
      try {
        store.seedCampus(campusId, baseline)
      } catch (error) {
        return errorResponse(error)
      }
      runtime.stores.set(campusId, store)
    }
    while (runtime.sessions.size >= 32) {
      const oldestSessionId = runtime.sessions.keys().next().value
      if (!oldestSessionId) break
      runtime.sessions.delete(oldestSessionId)
    }
    const session = { campusId, documentId, store, requestReceipts: new Map() }
    runtime.sessions.set(sessionId, session)
    const state = await stateFor(session, campusId)
    return json({ ok: true, localOnly: true, localRevision: state.revision, scopes: state.scopes }, 200)
  }

  if (payload.type !== 'commit') return json({ ok: false, localOnly: true, code: 'UNKNOWN_OPERATION' }, 400)
  const session = runtime.sessions.get(sessionId)
  if (!session) return json({ ok: false, localOnly: true, code: 'SESSION_EXPIRED', message: 'Local history is session-only and must be initialized again after reload.' }, 409)
  if (session.campusId !== campusId || session.documentId !== documentId) {
    return json({ ok: false, localOnly: true, code: 'SESSION_IDENTITY_MISMATCH' }, 409)
  }
  if (!validIdentity(payload.mutationId, 256) || !Number.isSafeInteger(payload.expectedRevision) || !Array.isArray(payload.operations) || payload.operations.length < 1 || payload.operations.length > 32) {
    return json({ ok: false, localOnly: true, code: 'INVALID_OPERATION' }, 400)
  }

  const mutationId = payload.mutationId
  const requestSignature = JSON.stringify({
    campusId,
    documentId,
    expectedRevision: payload.expectedRevision,
    operations: payload.operations,
  })
  const existingReceipt = session.requestReceipts.get(mutationId)
  if (existingReceipt) {
    if (existingReceipt.signature !== requestSignature) {
      return json({ ok: false, localOnly: true, code: 'MUTATION_ID_REUSED', message: 'This local mutation id is already bound to a different request.' }, 409)
    }
    return json({ ...existingReceipt.response, outcome: 'replayed' }, 200)
  }

  const expectedRevision = payload.expectedRevision as number
  const current = await stateFor(session, campusId)
  if (current.revision !== expectedRevision) {
    return json({ ok: false, localOnly: true, code: 'STALE_REVISION', localRevision: current.revision }, 409)
  }

  try {
    const candidates = payload.operations.map((entryValue, index) => {
      const entry = asRecord(entryValue)
      if (!entry || !validScope(entry.scope) || !Array.isArray(entry.dependencyScopes)) {
        throw new ScopedCommitError('INVALID_CANDIDATE', 'A local scoped operation has invalid scope or dependencies.')
      }
      const dependencySeen = new Set<string>()
      const dependencies = entry.dependencyScopes.map((dependencyValue) => {
        if (!validScope(dependencyValue)) throw new ScopedCommitError('INVALID_CANDIDATE', 'A local scoped dependency has an invalid scope.')
        const dependencyKey = `${dependencyValue.kind}:${dependencyValue.id}`
        if (dependencySeen.has(dependencyKey)) throw new ScopedCommitError('INVALID_CANDIDATE', 'A local scoped dependency is duplicated.')
        dependencySeen.add(dependencyKey)
        const currentDependency = current.scopes[dependencyKey]
        if (!currentDependency) throw new ScopedCommitError('DEPENDENCY_MISSING', `Required dependency ${dependencyKey} is not in this local session.`)
        return {
          scope: dependencyValue,
          revision: currentDependency.revision,
          contentChecksum: currentDependency.contentChecksum,
          required: true,
        }
      })
      const mutationId = `${payload.mutationId}:${index}:${entry.scope.kind}:${encodeURIComponent(entry.scope.id)}`
      return createScopedSaveCandidate({
        campusId,
        scope: entry.scope,
        expectedCampusRevision: expectedRevision,
        mutationId,
        content: entry.content,
        dependencies,
      })
    })
    const actor = { actorId: 'local-development-reference', isAdministrator: true }
    const result = candidates.length === 1
      ? await commitScopedCandidate(candidates[0], actor, session.store)
      : await commitScopedBatch(candidates, actor, session.store)
    const state = await stateFor(session, campusId)
    const responseBody: JsonRecord = {
      ok: true,
      localOnly: true,
      outcome: result.status,
      localRevision: state.revision,
      operationCount: candidates.length,
      scopes: state.scopes,
    }
    session.requestReceipts.set(mutationId, { signature: requestSignature, response: responseBody })
    while (session.requestReceipts.size > 256) {
      const oldestMutationId = session.requestReceipts.keys().next().value
      if (!oldestMutationId) break
      session.requestReceipts.delete(oldestMutationId)
    }
    return json(responseBody, 200)
  } catch (error) {
    return errorResponse(error)
  }
}
