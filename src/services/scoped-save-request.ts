import {
  commitScopedBatch,
  commitScopedCandidate,
  createScopedSaveCandidate,
  ScopedCommitError,
  type ScopedBatchCommitStore,
  type ScopedCommitActor,
  type ScopedSaveKind,
  type ScopedSaveScope,
} from './scoped-campus-save'
import type { ScopedPostgresAdapterError } from './scoped-postgres-adapter'
import type { ScopedSaveAuthorizationResult, VerifiedMutationUser, VerifiedPrincipalResult } from '@/lib/api-guard'

const MAX_BODY_BYTES = 1_048_576
const MAX_OPERATIONS = 32
const MAX_DEPENDENCIES_PER_OPERATION = 64
const SAVE_KINDS: readonly ScopedSaveKind[] = ['building', 'routing', 'terrain', 'campus-settings']

export interface ScopedSaveRequestDependencies {
  enabled(): boolean
  verifyPrincipal(request: Request): Promise<VerifiedPrincipalResult>
  authorize(principal: VerifiedMutationUser, campusId: string): ScopedSaveAuthorizationResult
  createStore(principal: VerifiedMutationUser, campusId: string): Promise<ScopedBatchCommitStore>
}

type JsonRecord = Record<string, unknown>

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function record(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : null
}

function hasOnlyKeys(value: JsonRecord, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function validIdentity(value: unknown, maxLength = 256): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value)
}

function validScope(value: unknown): value is ScopedSaveScope {
  const scope = record(value)
  return Boolean(
    scope &&
    hasOnlyKeys(scope, ['kind', 'id']) &&
    typeof scope.kind === 'string' && SAVE_KINDS.includes(scope.kind as ScopedSaveKind) &&
    validIdentity(scope.id),
  )
}

async function readBoundedJson(request: Request): Promise<{ value: unknown } | { error: 'INVALID_CONTENT_TYPE' | 'BODY_TOO_LARGE' | 'INVALID_JSON' }> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json') return { error: 'INVALID_CONTENT_TYPE' }
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return { error: 'BODY_TOO_LARGE' }
  const reader = request.body?.getReader()
  if (!reader) return { error: 'INVALID_JSON' }
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined)
        return { error: 'BODY_TOO_LARGE' }
      }
      chunks.push(value)
    }
  } catch {
    return { error: 'INVALID_JSON' }
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) }
  } catch {
    return { error: 'INVALID_JSON' }
  }
}

function invalidRequest(code = 'INVALID_REQUEST', status = 400): Response {
  return json({ ok: false, code }, status)
}

function mapCommitError(error: unknown): Response {
  if (error instanceof ScopedCommitError) {
    if (['STALE_REVISION', 'DEPENDENCY_CONFLICT', 'DEPENDENCY_MISSING', 'MUTATION_ID_REUSED', 'BATCH_REPLAY_INTEGRITY_FAILURE'].includes(error.code)) {
      return invalidRequest(error.code, 409)
    }
    if (error.code === 'CAMPUS_NOT_FOUND') return invalidRequest('CAMPUS_NOT_INITIALIZED', 404)
    if (error.code === 'UNAUTHORIZED') return invalidRequest('AUTHORIZATION_DENIED', 403)
    if (error.code === 'INVALID_CANDIDATE' || error.code === 'INVALID_ACKNOWLEDGMENT') return invalidRequest(error.code, 400)
  }
  const adapterError = error as Partial<ScopedPostgresAdapterError> | null
  const code = adapterError?.code
  if (code === 'COMMIT_OUTCOME_UNKNOWN') {
    return json({ ok: false, code, retry: 'exact-request' }, 503)
  }
  if (code === 'AUTHORIZATION_DENIED') return invalidRequest('AUTHORIZATION_DENIED', 403)
  if (code === 'CAMPUS_ALREADY_INITIALIZED' || code === 'DOCUMENT_IDENTITY_MISMATCH') return invalidRequest('CAMPUS_IDENTITY_CONFLICT', 409)
  return invalidRequest('SCOPED_STORAGE_UNAVAILABLE', 503)
}

export async function handleScopedSaveRequest(
  request: Request,
  dependencies: ScopedSaveRequestDependencies,
): Promise<Response> {
  if (!dependencies.enabled()) return invalidRequest('DISABLED', 404)
  if (request.method !== 'POST') return invalidRequest('METHOD_NOT_ALLOWED', 405)

  const parsed = await readBoundedJson(request)
  if ('error' in parsed) {
    if (parsed.error === 'BODY_TOO_LARGE') return invalidRequest(parsed.error, 413)
    if (parsed.error === 'INVALID_CONTENT_TYPE') return invalidRequest(parsed.error, 415)
    return invalidRequest(parsed.error, 400)
  }
  const body = record(parsed.value)
  if (!body || !hasOnlyKeys(body, ['campusId', 'expectedCampusRevision', 'operations'])) return invalidRequest()
  if (!validIdentity(body.campusId)) return invalidRequest('INVALID_CAMPUS')
  if (!Number.isSafeInteger(body.expectedCampusRevision) || (body.expectedCampusRevision as number) < 0) return invalidRequest('INVALID_REVISION')
  if (!Array.isArray(body.operations) || body.operations.length < 1 || body.operations.length > MAX_OPERATIONS) return invalidRequest('INVALID_OPERATIONS')

  const authentication = await dependencies.verifyPrincipal(request)
  if (!authentication.ok) return authentication.response
  const principal = authentication.principal
  const authorization = dependencies.authorize(principal, body.campusId)
  if (!authorization.authorized) {
    const status = authorization.code === 'INVALID_CAMPUS' ? 400 : 403
    return invalidRequest(authorization.code, status)
  }

  const candidates = []
  const mutationIds = new Set<string>()
  const scopeKeys = new Set<string>()
  try {
    for (const operationValue of body.operations) {
      const operation = record(operationValue)
      if (!operation || !hasOnlyKeys(operation, ['mutationId', 'scope', 'content', 'dependencies'])) return invalidRequest('INVALID_OPERATION')
      if (!validIdentity(operation.mutationId) || !validScope(operation.scope)) return invalidRequest('INVALID_OPERATION')
      if (!Array.isArray(operation.dependencies) || operation.dependencies.length > MAX_DEPENDENCIES_PER_OPERATION) return invalidRequest('INVALID_DEPENDENCIES')
      for (const dependency of operation.dependencies) {
        const entry = record(dependency)
        if (!entry || !hasOnlyKeys(entry, ['scope', 'revision', 'contentChecksum', 'required']) || !validScope(entry.scope)) return invalidRequest('INVALID_DEPENDENCIES')
      }
      const scope = operation.scope
      const scopeKey = `${scope.kind}:${scope.id}`
      if (mutationIds.has(operation.mutationId) || scopeKeys.has(scopeKey)) return invalidRequest('DUPLICATE_OPERATION')
      mutationIds.add(operation.mutationId)
      scopeKeys.add(scopeKey)
      candidates.push(createScopedSaveCandidate({
        campusId: body.campusId,
        scope,
        expectedCampusRevision: body.expectedCampusRevision as number,
        mutationId: operation.mutationId,
        content: operation.content,
        dependencies: operation.dependencies as never[],
      }))
    }
  } catch (error) {
    if (error instanceof ScopedCommitError) return invalidRequest('INVALID_CANDIDATE')
    return invalidRequest('INVALID_CANDIDATE')
  }

  try {
    const store = await dependencies.createStore(principal, body.campusId)
    const actor: ScopedCommitActor = { actorId: principal.id, isAdministrator: true }
    if (candidates.length === 1) {
      const result = await commitScopedCandidate(candidates[0], actor, store)
      if (result.status === 'unchanged') {
        return json({ ok: true, durable: true, storage: 'local-e5-synthetic', outcome: 'unchanged', revision: result.revision, acknowledgments: [] }, 200)
      }
      return json({ ok: true, durable: true, storage: 'local-e5-synthetic', outcome: result.status, acknowledgments: [result.acknowledgment] }, 200)
    }
    const result = await commitScopedBatch(candidates, actor, store)
    if (result.status === 'unchanged') {
      return json({ ok: true, durable: true, storage: 'local-e5-synthetic', outcome: 'unchanged', revision: result.revision, acknowledgments: [] }, 200)
    }
    return json({ ok: true, durable: true, storage: 'local-e5-synthetic', outcome: result.status, acknowledgments: result.acknowledgments }, 200)
  } catch (error) {
    return mapCommitError(error)
  }
}
