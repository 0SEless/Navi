import type { CampusDocument } from '@navi/core'
import { deriveScopedDocumentChanges, projectScopedDocument } from './scoped-change-detection'

export type ScopedHistoryClientStatus = 'disabled' | 'session-only' | 'validating' | 'validated' | 'rejected' | 'conflict' | 'error'

export interface ScopedHistoryClientState {
  status: ScopedHistoryClientStatus
  campusId: string | null
  localRevision: number | null
  cloudAcknowledged: false
  detail: string | null
}

interface ClientOptions {
  enabled: () => boolean
  fetcher?: typeof fetch
  newSessionId?: () => string
  coalesceMs?: number
  onStateChange?: (state: ScopedHistoryClientState) => void
}

interface PendingCommit {
  body: string
  submittedDocument: CampusDocument
}

interface DevApiResponse {
  ok?: boolean
  localOnly?: boolean
  localRevision?: number
  outcome?: 'committed' | 'replayed' | 'unchanged'
  code?: string
  message?: string
}

const SESSION_ONLY_DETAIL = 'Scoped history is local to this page session and resets on reload. IndexedDB draft recovery is separate.'

function cloneDocument(document: CampusDocument): CampusDocument {
  return structuredClone(document)
}

function defaultSessionId(): string {
  const randomUUID = globalThis.crypto?.randomUUID
  if (!randomUUID) throw new Error('Secure random session identifiers are unavailable in this browser.')
  return randomUUID.call(globalThis.crypto)
}

export function createScopedHistoryDevClient(options: ClientOptions) {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
  let state: ScopedHistoryClientState = {
    status: 'disabled', campusId: null, localRevision: null, cloudAcknowledged: false, detail: null,
  }
  let sessionId: string | null = null
  let campusId: string | null = null
  let committedDocument: CampusDocument | null = null
  let latestDocument: CampusDocument | null = null
  let localRevision: number | null = null
  let sequence = 0
  let pendingCommit: PendingCommit | null = null
  let flushing: Promise<void> | null = null
  let startPromise: Promise<void> | null = null
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  const cancelScheduledFlush = () => {
    if (flushTimer !== null) clearTimeout(flushTimer)
    flushTimer = null
  }

  const publish = (next: ScopedHistoryClientState) => {
    state = next
    options.onStateChange?.(state)
  }

  const setStatus = (status: ScopedHistoryClientStatus, detail: string | null = null) => {
    publish({ status, campusId, localRevision, cloudAcknowledged: false, detail })
  }

  const send = async (body: string): Promise<DevApiResponse> => {
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetcher('/api/dev/scoped-history', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body,
          cache: 'no-store',
        })
        const result = await response.json() as DevApiResponse
        if (!response.ok || !result.ok || result.localOnly !== true) {
          const error = new Error(result.message ?? result.code ?? 'Local scoped history request failed.') as Error & { status?: number; code?: string }
          error.status = response.status
          error.code = result.code
          throw error
        }
        return result
      } catch (error) {
        lastError = error
        const status = (error as { status?: number } | null)?.status
        if (status !== undefined || attempt === 1) break
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Local scoped history request failed.')
  }

  const initialize = async (document: CampusDocument, activeCampusId: string) => {
    cancelScheduledFlush()
    if (!options.enabled()) {
      sessionId = null
      campusId = activeCampusId
      committedDocument = null
      latestDocument = null
      localRevision = null
      pendingCommit = null
      setStatus('disabled')
      return
    }

    const projection = projectScopedDocument(document, activeCampusId)
    if (projection.status !== 'projected') {
      campusId = activeCampusId
      setStatus('rejected', projection.message)
      return
    }
    const id = options.newSessionId?.() ?? defaultSessionId()
    const baseline = projection.scopes.map(({ scope, content }) => ({ scope, content }))
    const body = JSON.stringify({
      type: 'initialize',
      sessionId: id,
      campusId: activeCampusId,
      documentId: `campus:${activeCampusId}`,
      baseline,
    })
    sessionId = id
    campusId = activeCampusId
    committedDocument = cloneDocument(document)
    latestDocument = cloneDocument(document)
    localRevision = null
    pendingCommit = null
    setStatus('validating', SESSION_ONLY_DETAIL)
    try {
      const response = await send(body)
      if (!Number.isSafeInteger(response.localRevision)) throw new Error('Local scoped history did not return a valid revision.')
      localRevision = response.localRevision as number
      setStatus('session-only', SESSION_ONLY_DETAIL)
    } catch (error) {
      const status = (error as { status?: number } | null)?.status
      setStatus(status === 409 ? 'conflict' : 'error', error instanceof Error ? error.message : 'Local scoped history could not be initialized.')
    }
  }

  const createPendingCommit = (document: CampusDocument): PendingCommit | null => {
    if (!sessionId || !campusId || localRevision === null || !committedDocument) return null
    const changes = deriveScopedDocumentChanges(committedDocument, document, campusId)
    if (changes.status === 'unchanged') {
      committedDocument = cloneDocument(document)
      return null
    }
    if (changes.status === 'rejected') {
      committedDocument = cloneDocument(document)
      setStatus('rejected', changes.message)
      return null
    }
    sequence += 1
    const body = JSON.stringify({
      type: 'commit',
      sessionId,
      campusId,
      documentId: `campus:${campusId}`,
      mutationId: `${sessionId}:mutation:${sequence}`,
      expectedRevision: localRevision,
      operations: changes.operations.map(({ scope, content, dependencyScopes }) => ({ scope, content, dependencyScopes })),
    })
    return { body, submittedDocument: cloneDocument(document) }
  }

  const flushPending = async (): Promise<void> => {
    if (!options.enabled()) {
      setStatus('disabled')
      return
    }
    if (!sessionId || !campusId || localRevision === null || !committedDocument || !latestDocument) return
    while (true) {
      if (!pendingCommit) pendingCommit = createPendingCommit(latestDocument)
      if (!pendingCommit) return
      const submitted = pendingCommit
      setStatus('validating', SESSION_ONLY_DETAIL)
      try {
        const result = await send(submitted.body)
        if (!Number.isSafeInteger(result.localRevision)) throw new Error('Local scoped history did not return a valid revision.')
        localRevision = result.localRevision as number
        committedDocument = submitted.submittedDocument
        pendingCommit = null
        setStatus('validated', 'Scoped operation validated in the local reference history only. This is not a cloud save.')
      } catch (error) {
        const status = (error as { status?: number } | null)?.status
        const code = (error as { code?: string } | null)?.code
        setStatus(status === 409 ? 'conflict' : 'error', error instanceof Error ? error.message : 'Local scoped history validation failed.')
        if (code === 'SESSION_EXPIRED') {
          pendingCommit = null
          committedDocument = latestDocument
        }
        return
      }
      if (JSON.stringify(committedDocument) === JSON.stringify(latestDocument)) return
    }
  }

  const enqueueFlush = async () => {
    if (!options.enabled()) {
      setStatus('disabled')
      return
    }
    if (startPromise) await startPromise
    if (flushing) {
      await flushing
      if (state.status !== 'error' && state.status !== 'conflict' && committedDocument && latestDocument && JSON.stringify(committedDocument) !== JSON.stringify(latestDocument)) {
        return enqueueFlush()
      }
      return
    }
    flushing = flushPending()
    try {
      await flushing
    } finally {
      flushing = null
    }
    if (state.status !== 'error' && state.status !== 'conflict' && committedDocument && latestDocument && JSON.stringify(committedDocument) !== JSON.stringify(latestDocument)) {
      return enqueueFlush()
    }
  }

  return {
    async start(document: CampusDocument, activeCampusId: string): Promise<void> {
      if (campusId !== activeCampusId || !sessionId) {
        startPromise = initialize(document, activeCampusId)
        await startPromise
        startPromise = null
        if (latestDocument && committedDocument && JSON.stringify(latestDocument) !== JSON.stringify(committedDocument)) await enqueueFlush()
        return
      }
      latestDocument = cloneDocument(document)
    },
    async recordDocument(document: CampusDocument): Promise<void> {
      if (!options.enabled()) {
        cancelScheduledFlush()
        setStatus('disabled')
        return
      }
      latestDocument = cloneDocument(document)
      const coalesceMs = Number.isFinite(options.coalesceMs) ? Math.max(0, options.coalesceMs ?? 0) : 0
      if (coalesceMs > 0) {
        cancelScheduledFlush()
        setStatus('validating', 'Waiting for the current edit gesture to settle before validating one scoped change.')
        flushTimer = setTimeout(() => {
          flushTimer = null
          void enqueueFlush()
        }, coalesceMs)
        return
      }
      await enqueueFlush()
    },
    async retry(): Promise<void> {
      cancelScheduledFlush()
      await enqueueFlush()
    },
    dispose(): void {
      cancelScheduledFlush()
    },
    getState(): ScopedHistoryClientState {
      return { ...state }
    },
  }
}
