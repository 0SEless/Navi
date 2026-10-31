import type { CampusDocument } from '@navi/core'
import { deriveScopedDocumentChanges } from './scoped-change-detection'
import { applyScopedCampusSnapshot, type ScopedCampusSnapshot } from './scoped-campus-snapshot'
import type { ScopedSaveScope } from './scoped-campus-save'
import { createDurableScopedCandidates, createScopedSaveClient, type DurableScopedSaveRequest } from './scoped-save-client'
import { traceScopedSaveDevelopment } from './scoped-save-diagnostics'

interface ScopedStateResponse {
  ok?: boolean
  code?: string
  campusId?: string
  revision?: number
  scopes?: Record<string, { revision: number; contentChecksum: string }>
  snapshot?: ScopedCampusSnapshot
  storage?: string
}

const key = (scope: ScopedSaveScope) => `${scope.kind}:${scope.id}`

export function createScopedSaveDocumentSession(options: {
  campusId: string
  enabled: () => boolean
  fetcher?: typeof fetch
  onStateChange?: (state: ReturnType<ReturnType<typeof createScopedSaveClient>['getState']>) => void
}) {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
  const client = createScopedSaveClient({ enabled: options.enabled, fetcher, onStateChange: options.onStateChange })
  let baseline: CampusDocument | null = null
  let revision: number | null = null
  let scopes: Record<string, { revision: number; contentChecksum: string }> = {}
  let pending: DurableScopedSaveRequest | null = null
  let pendingDocument: CampusDocument | null = null

  const initialize = async (document: CampusDocument) => {
    if (document.metadata?.campusId !== options.campusId) throw new Error('The active campus identity does not match the editor document.')
    const response = await fetcher(`/api/studio/scoped-save?campusId=${encodeURIComponent(options.campusId)}`, { method: 'GET', credentials: 'same-origin', cache: 'no-store' })
    const state = await response.json().catch(() => ({})) as ScopedStateResponse
    if (!response.ok || state.ok !== true || state.storage !== 'local-e5-synthetic' || state.campusId !== options.campusId || !Number.isSafeInteger(state.revision) || !state.scopes || !state.snapshot) {
      throw new Error(state.code ?? 'The local E5 campus baseline is unavailable.')
    }
    const restored = await applyScopedCampusSnapshot(document, state.snapshot)
    if (state.snapshot.revision !== state.revision) throw new Error('The local E5 campus snapshot revision is inconsistent.')
    baseline = restored
    revision = state.revision as number
    scopes = { ...state.scopes }
    traceScopedSaveDevelopment('session.initialized', { revision, scopeCount: Object.keys(scopes).length })
    return restored
  }

  const save = async (document: CampusDocument) => {
    if (!options.enabled()) throw new Error('Durable local scoped saving is disabled.')
    if (document.metadata?.campusId !== options.campusId) throw new Error('The active campus identity does not match the editor document.')
    if (!baseline || revision === null) await initialize(document)
    if (pending) {
      const acknowledgedDocument = pendingDocument ?? structuredClone(document)
      const candidates = await createDurableScopedCandidates(pending)
      const result = await client.save(pending)
      revision = result.revision
      for (const candidate of candidates) {
        scopes[key(candidate.scope)] = { revision: revision as number, contentChecksum: candidate.contentChecksum }
      }
      pending = null
      pendingDocument = null
      // An exact retry may be acknowledged after the user has made another
      // edit. Advance only to the document represented by those original
      // request bytes so the later edit remains visible to the next diff.
      baseline = structuredClone(acknowledgedDocument)
      return result
    }
    const changes = deriveScopedDocumentChanges(baseline as CampusDocument, document, options.campusId)
    traceScopedSaveDevelopment('session.diff', {
      status: changes.status,
      scopeCount: changes.status === 'classified' ? changes.operations.length : 0,
      scopeKinds: changes.status === 'classified' ? changes.operations.map((operation) => operation.scope.kind) : [],
      revision,
    })
    if (changes.status === 'unchanged') return client.getState()
    if (changes.status !== 'classified') throw new Error(changes.message)
    const expectedRevision = revision as number
    const mutationPrefix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const operations = changes.operations.map((operation, index) => ({
      mutationId: `${mutationPrefix}:${index}`,
      scope: operation.scope,
      content: operation.content,
      dependencies: operation.dependencyScopes.flatMap((dependency) => {
        const current = scopes[key(dependency)]
        return current ? [{ scope: dependency, revision: current.revision, contentChecksum: current.contentChecksum, required: true }] : []
      }),
    }))
    pending = { campusId: options.campusId, expectedCampusRevision: expectedRevision, operations }
    pendingDocument = structuredClone(document)
    const candidates = await createDurableScopedCandidates(pending)
    traceScopedSaveDevelopment('session.candidates.created', { scopeCount: candidates.length, scopeKinds: candidates.map((candidate) => candidate.scope.kind), expectedRevision })
    const result = await client.save(pending)
    traceScopedSaveDevelopment('session.commit.acknowledged', { outcome: result.status, revision: result.revision, scopeCount: candidates.length })
    revision = result.revision
    for (const candidate of candidates) {
      scopes[key(candidate.scope)] = { revision: revision as number, contentChecksum: candidate.contentChecksum }
    }
    baseline = structuredClone(pendingDocument ?? document)
    pending = null
    pendingDocument = null
    return result
  }

  return { initialize, save, getState: client.getState }
}
