import { NextRequest } from 'next/server'
import { authorizeScopedSave, verifyMutationPrincipal, type VerifiedMutationUser } from '@/lib/api-guard'
import { handleScopedSaveRequest, type ScopedSaveRequestDependencies } from '@/services/scoped-save-request'
import { PostgresScopedCommitStore } from '@/services/scoped-postgres-adapter'
import { assertE5ScopedDatabaseIdentity, getE5ScopedPostgresPool } from '@/services/scoped-postgres-runtime'

export const runtime = 'nodejs'

type HandlerOverrides = Partial<ScopedSaveRequestDependencies>

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || normalized === '::1' || /^127(?:\.\d{1,3}){3}$/.test(normalized)
}

function isLoopbackRequest(request: Request): boolean {
  let requestUrl: URL
  try {
    requestUrl = new URL(request.url)
  } catch {
    return false
  }
  if (!isLoopbackHostname(requestUrl.hostname)) return false

  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    const originUrl = new URL(origin)
    return isLoopbackHostname(originUrl.hostname) && originUrl.origin === requestUrl.origin
  } catch {
    return false
  }
}

function enabledByDefault(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.NAVI_STUDIO_DURABLE_SCOPED_SAVE === '1'
}

function defaultDependencies(): ScopedSaveRequestDependencies {
  return {
    enabled: enabledByDefault,
    verifyPrincipal: async (request) => verifyMutationPrincipal(request as NextRequest),
    authorize: authorizeScopedSave,
    createStore: async (principal: VerifiedMutationUser, campusId: string) => {
      const pool = getE5ScopedPostgresPool()
      await assertE5ScopedDatabaseIdentity(pool)
      return new PostgresScopedCommitStore({
        pool,
        resolveTrustedActor: () => principal.id,
        resolveDocumentId: (requestedCampusId) => requestedCampusId === campusId ? `campus:${campusId}` : null,
        authorizeActor: (context) =>
          context.actorId === principal.id &&
          context.campusId === campusId &&
          context.documentId === `campus:${campusId}` &&
          authorizeScopedSave(principal, campusId).authorized,
      })
    },
  }
}

function createScopedSavePostHandler(overrides: HandlerOverrides = {}) {
  const dependencies = { ...defaultDependencies(), ...overrides }
  return async function POST(request: Request): Promise<Response> {
    if (!isLoopbackRequest(request)) {
      return new Response(JSON.stringify({ ok: false, code: 'LOOPBACK_ONLY' }), {
        status: 403,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      })
    }
    return handleScopedSaveRequest(request, dependencies)
  }
}

export const POST = createScopedSavePostHandler()

function createScopedSaveGetHandler(overrides: HandlerOverrides = {}) {
  const dependencies = { ...defaultDependencies(), ...overrides }
  return async function GET(request: Request): Promise<Response> {
    if (!isLoopbackRequest(request)) {
      return new Response(JSON.stringify({ ok: false, code: 'LOOPBACK_ONLY' }), { status: 403, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
    }
    if (!dependencies.enabled()) {
      return new Response(JSON.stringify({ ok: false, code: 'DISABLED' }), { status: 404, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
    }
    const url = new URL(request.url)
    const campusId = url.searchParams.get('campusId')
    if (!campusId || campusId.length > 256 || campusId !== campusId.trim()) {
      return new Response(JSON.stringify({ ok: false, code: 'INVALID_CAMPUS' }), { status: 400, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
    }
    const authentication = await dependencies.verifyPrincipal(request)
    if (!authentication.ok) return authentication.response
    const authorization = dependencies.authorize(authentication.principal, campusId)
    if (!authorization.authorized) return new Response(JSON.stringify({ ok: false, code: authorization.code }), { status: authorization.code === 'INVALID_CAMPUS' ? 400 : 403, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
    try {
      const store = await dependencies.createStore(authentication.principal, campusId)
      if (!(store instanceof PostgresScopedCommitStore)) {
        throw new Error('The E5 snapshot reader is unavailable.')
      }
      const state = await store.readCampusState(campusId)
      const snapshot = await store.reconstructCampus(campusId, state.revision)
      if (snapshot.campusId !== campusId || snapshot.revision !== state.revision) throw new Error('The E5 reconstructed snapshot identity is inconsistent.')
      return new Response(JSON.stringify({ ok: true, campusId: state.campusId, revision: state.revision, scopes: state.scopes, snapshot, storage: 'local-e5-synthetic' }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
    } catch {
      return new Response(JSON.stringify({ ok: false, code: 'SCOPED_STORAGE_UNAVAILABLE' }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
    }
  }
}

export const GET = createScopedSaveGetHandler()
