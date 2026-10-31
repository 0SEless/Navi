import type { ScopedCommitAcknowledgment, ScopedSaveDependency, ScopedSaveScope } from './scoped-campus-save'
import { traceScopedSaveDevelopment } from './scoped-save-diagnostics'

export type DurableScopedSaveStatus = 'local-draft' | 'saving' | 'durably-committed-local' | 'failed' | 'conflict'
export interface DurableScopedSaveState {
  status: DurableScopedSaveStatus
  revision: number | null
  hasPendingRequest: boolean
  detail: string | null
  cloudAcknowledged: false
}

export interface DurableScopedSaveOperation {
  mutationId: string
  scope: ScopedSaveScope
  content: unknown
  dependencies: readonly { scope: ScopedSaveScope; revision: number; contentChecksum: string; required: boolean }[]
}

export interface DurableScopedSaveRequest {
  campusId: string
  expectedCampusRevision: number
  operations: readonly DurableScopedSaveOperation[]
}

interface BrowserCandidate {
  contractVersion: 1
  campusId: string
  scope: ScopedSaveScope
  expectedCampusRevision: number
  mutationId: string
  requestChecksum: string
  contentChecksum: string
  content: unknown
  dependencies: readonly ScopedSaveDependency[]
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(Object.keys(record).sort().flatMap((key) => record[key] === undefined ? [] : [[key, canonicalize(record[key])]]))
}

async function sha256(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Secure browser checksum support is unavailable.')
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Browser-safe checksum used to validate server-owned scoped snapshots. */
export function hashDurableScopedContent(value: unknown): Promise<string> {
  return sha256(value)
}

export async function createDurableScopedCandidates(request: DurableScopedSaveRequest): Promise<BrowserCandidate[]> {
  return Promise.all(request.operations.map(async (operation) => {
    const dependencies = [...operation.dependencies]
      .map((dependency) => ({ ...dependency, contentChecksum: dependency.contentChecksum.toLowerCase() }))
      .sort((left, right) => {
        const leftKey = `${left.scope.kind}\u0000${left.scope.id}`
        const rightKey = `${right.scope.kind}\u0000${right.scope.id}`
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
      })
    const contentChecksum = await sha256(operation.content)
    const requestChecksum = await sha256({
      contractVersion: 1,
      campusId: request.campusId,
      scope: operation.scope,
      expectedCampusRevision: request.expectedCampusRevision,
      mutationId: operation.mutationId,
      contentChecksum,
      dependencies,
    })
    return { contractVersion: 1, campusId: request.campusId, scope: operation.scope, expectedCampusRevision: request.expectedCampusRevision, mutationId: operation.mutationId, requestChecksum, contentChecksum, content: operation.content, dependencies }
  }))
}

async function verifyCandidateAcknowledgment(candidate: BrowserCandidate, acknowledgment: ScopedCommitAcknowledgment): Promise<boolean> {
  return acknowledgment?.campusId === candidate.campusId &&
    acknowledgment.mutationId === candidate.mutationId &&
    acknowledgment.requestChecksum === candidate.requestChecksum &&
    acknowledgment.contentChecksum === candidate.contentChecksum &&
    Number.isSafeInteger(acknowledgment.revision) &&
    acknowledgment.revision === candidate.expectedCampusRevision + 1 &&
    typeof acknowledgment.committedAt === 'string' && Number.isFinite(Date.parse(acknowledgment.committedAt)) &&
    (acknowledgment.batchChecksum === undefined || /^[a-f0-9]{64}$/.test(acknowledgment.batchChecksum))
}

async function verifyBatchAcknowledgments(candidates: readonly BrowserCandidate[], acknowledgments: readonly ScopedCommitAcknowledgment[]): Promise<boolean> {
  if (candidates.length < 2 || acknowledgments.length !== candidates.length) return false
  if (!(await Promise.all(candidates.map((candidate, index) => verifyCandidateAcknowledgment(candidate, acknowledgments[index])))).every(Boolean)) return false
  const bound = acknowledgments.filter((acknowledgment) => acknowledgment.batchChecksum !== undefined)
  if (bound.length === 0) return true
  const first = candidates[0]
  const members = candidates.map((candidate) => ({ mutationId: candidate.mutationId, requestChecksum: candidate.requestChecksum, contentChecksum: candidate.contentChecksum, scope: candidate.scope }))
    .sort((left, right) => left.mutationId < right.mutationId ? -1 : left.mutationId > right.mutationId ? 1 : 0)
  const batchChecksum = await sha256({ contractVersion: 1, campusId: first.campusId, expectedCampusRevision: first.expectedCampusRevision, members })
  return bound.length === acknowledgments.length && acknowledgments.every((acknowledgment) => acknowledgment.batchChecksum === batchChecksum)
}

interface ScopedSaveClientOptions {
  enabled: () => boolean
  fetcher?: typeof fetch
  onStateChange?: (state: DurableScopedSaveState) => void
}

interface DurableResponse {
  ok?: boolean
  durable?: boolean
  storage?: string
  outcome?: string
  code?: string
  revision?: number
  acknowledgments?: ScopedCommitAcknowledgment[]
}

export function createScopedSaveClient(options: ScopedSaveClientOptions) {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
  let state: DurableScopedSaveState = { status: 'local-draft', revision: null, hasPendingRequest: false, detail: null, cloudAcknowledged: false }
  let pending: { body: string; candidates: BrowserCandidate[] } | null = null
  const publish = (next: DurableScopedSaveState) => { state = next; options.onStateChange?.({ ...state }) }

  const save = async (request: DurableScopedSaveRequest): Promise<DurableScopedSaveState> => {
    if (!options.enabled()) {
      publish({ status: 'failed', revision: state.revision, hasPendingRequest: false, detail: 'Durable local scoped saving is disabled.', cloudAcknowledged: false })
      throw new Error('Durable local scoped saving is disabled.')
    }
    const candidates = await createDurableScopedCandidates(request)
    const body = JSON.stringify({
      campusId: request.campusId,
      expectedCampusRevision: request.expectedCampusRevision,
      operations: request.operations,
    })
    // A caller retrying an identical request reuses the original bytes. A new
    // request never silently replaces an unresolved ambiguous commit.
    if (pending && pending.body !== body) throw new Error('Resolve the pending scoped save with an exact retry before submitting different content.')
    pending ??= { body, candidates }
    publish({ status: 'saving', revision: state.revision, hasPendingRequest: true, detail: null, cloudAcknowledged: false })
    let response: Response
    try {
      traceScopedSaveDevelopment('http.dispatch', { path: '/api/studio/scoped-save', expectedRevision: request.expectedCampusRevision, scopeCount: candidates.length, scopeKinds: candidates.map((candidate) => candidate.scope.kind), bodyBytes: new TextEncoder().encode(pending.body).byteLength })
      response = await fetcher('/api/studio/scoped-save', {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
        body: pending.body, cache: 'no-store',
      })
    } catch {
      publish({ status: 'failed', revision: state.revision, hasPendingRequest: true, detail: 'The save outcome is unknown. Retry the exact request.', cloudAcknowledged: false })
      throw new Error('The save outcome is unknown. Retry the exact request.')
    }
    const result = await response.json().catch(() => ({})) as DurableResponse
    traceScopedSaveDevelopment('http.response', { status: response.status, ok: response.ok, code: result.code ?? null, outcome: result.outcome ?? null, acknowledgmentCount: result.acknowledgments?.length ?? 0, revision: result.revision ?? result.acknowledgments?.[0]?.revision ?? null })
    if (!response.ok || result.ok !== true) {
      const conflict = response.status === 409
      publish({ status: conflict ? 'conflict' : 'failed', revision: state.revision, hasPendingRequest: true, detail: result.code ?? 'Scoped save failed.', cloudAcknowledged: false })
      throw new Error(result.code ?? 'Scoped save failed.')
    }
    if (result.durable !== true || result.storage !== 'local-e5-synthetic' || !Array.isArray(result.acknowledgments)) {
      publish({ status: 'failed', revision: state.revision, hasPendingRequest: true, detail: 'The server response was not a durable E5 acknowledgment.', cloudAcknowledged: false })
      throw new Error('The server response was not a durable E5 acknowledgment.')
    }
    const acknowledgments = result.acknowledgments
    const valid = pending.candidates.length === 1
      ? acknowledgments.length === 1 && await verifyCandidateAcknowledgment(pending.candidates[0], acknowledgments[0])
      : await verifyBatchAcknowledgments(pending.candidates, acknowledgments)
    if (!valid) {
      publish({ status: 'failed', revision: state.revision, hasPendingRequest: true, detail: 'The server acknowledgment did not match the submitted scoped save.', cloudAcknowledged: false })
      throw new Error('The server acknowledgment did not match the submitted scoped save.')
    }
    const revision = acknowledgments[0]?.revision
    if (!Number.isSafeInteger(revision) || acknowledgments.some((acknowledgment) => acknowledgment.revision !== revision)) {
      publish({ status: 'failed', revision: state.revision, hasPendingRequest: true, detail: 'The server acknowledgment revisions were inconsistent.', cloudAcknowledged: false })
      throw new Error('The server acknowledgment revisions were inconsistent.')
    }
    pending = null
    publish({ status: 'durably-committed-local', revision: revision as number, hasPendingRequest: false, detail: 'Saved to the local synthetic E5 database.', cloudAcknowledged: false })
    return { ...state }
  }

  return { save, getState: () => ({ ...state }) }
}
