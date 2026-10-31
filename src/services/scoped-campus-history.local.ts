/**
 * Local-only reference store for scoped persistence contract tests and synthetic
 * development. This module is not imported by application routes and has no
 * network or database adapter. Production persistence remains disabled until a
 * separately approved server transaction path exists.
 */
import {
  scopedContentChecksum,
  type ScopedCampusState,
  type ScopedCommitAcknowledgment,
  type ScopedCommitStore,
  type ScopedBatchAtomicCommitResult,
  type ScopedSaveCandidate,
  type ScopedSaveDependency,
  type ScopedSaveScope,
} from './scoped-campus-save'

export interface StoredLocalScope {
  scope: ScopedSaveScope
  revision: number
  contentChecksum: string
  content: unknown
}

export interface ScopedReplaceOperation {
  kind: 'replace-scope'
  beforeChecksum: string
  afterChecksum: string
  content: unknown
}

export interface LocalScopedChangeSet {
  kind: 'scoped-change'
  campusId: string
  revision: number
  mutationId: string
  requestChecksum: string
  scope: ScopedSaveScope
  dependencies: readonly ScopedSaveDependency[]
  beforeCampusChecksum: string
  afterCampusChecksum: string
  operation: ScopedReplaceOperation
  actorId: string
  committedAt: string
}

export interface LocalScopedBatchChangeSet {
  kind: 'scoped-batch'
  campusId: string
  revision: number
  /** First changed scope/operation retained for callers that inspect single-scope history metadata. */
  scope: ScopedSaveScope
  operation: ScopedReplaceOperation
  mutationIds: readonly string[]
  requestChecksums: readonly string[]
  beforeCampusChecksum: string
  afterCampusChecksum: string
  operations: ReadonlyArray<{
    scope: ScopedSaveScope
    operation: ScopedReplaceOperation
  }>
  actorId: string
  committedAt: string
}

export type LocalHistoryChangeSet = LocalScopedChangeSet | LocalScopedBatchChangeSet

export interface LocalCampusCheckpoint {
  campusId: string
  revision: number
  checksum: string
  scopes: Record<string, StoredLocalScope>
}

export interface ReconstructedCampus {
  campusId: string
  revision: number
  checksum: string
  scopes: Record<string, StoredLocalScope>
}

interface MemoryCampus {
  campusId: string
  revision: number
  scopes: Record<string, StoredLocalScope>
  receipts: Map<string, ScopedCommitAcknowledgment>
  changes: LocalHistoryChangeSet[]
  checkpoints: Map<number, LocalCampusCheckpoint>
}

export interface SeedScope {
  scope: ScopedSaveScope
  content: unknown
}

export class ScopedHistoryIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScopedHistoryIntegrityError'
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function scopeKey(scope: ScopedSaveScope): string {
  return `${scope.kind}:${scope.id}`
}

const MISSING_CONTENT_CHECKSUM = scopedContentChecksum({ kind: 'missing-scope-content-v1' })

function scopesChecksum(campusId: string, revision: number, scopes: Record<string, StoredLocalScope>): string {
  const orderedScopes = Object.fromEntries(
    Object.entries(scopes).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
  )
  return scopedContentChecksum({ campusId, revision, scopes: orderedScopes })
}

function campusState(campus: MemoryCampus): ScopedCampusState {
  return {
    campusId: campus.campusId,
    revision: campus.revision,
    scopes: Object.fromEntries(
      Object.entries(campus.scopes).map(([key, value]) => [key, {
        revision: value.revision,
        contentChecksum: value.contentChecksum,
      }]),
    ),
  }
}

/**
 * Deterministic in-memory implementation of the atomic store boundary. All
 * transaction checks and writes happen synchronously before the returned Promise
 * resolves, so concurrent callers in one JS runtime serialize on campus CAS.
 */
export class InMemoryScopedCommitStore implements ScopedCommitStore {
  private readonly campuses = new Map<string, MemoryCampus>()

  constructor(
    private readonly checkpointInterval = 5,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    if (!Number.isSafeInteger(checkpointInterval) || checkpointInterval < 1) {
      throw new Error('checkpointInterval must be a positive safe integer.')
    }
  }

  seedCampus(campusId: string, initialScopes: readonly SeedScope[] = []): void {
    const normalizedCampusId = campusId.trim()
    if (!normalizedCampusId || this.campuses.has(normalizedCampusId)) {
      throw new Error('A unique, non-empty campus id is required.')
    }
    const scopes: Record<string, StoredLocalScope> = {}
    for (const initial of initialScopes) {
      if (!initial.scope?.id?.trim()) throw new Error('Seed scopes require a stable scope id.')
      const key = scopeKey(initial.scope)
      if (scopes[key]) throw new Error(`Duplicate seed scope: ${key}`)
      const content = cloneJson(initial.content)
      scopes[key] = {
        scope: { ...initial.scope, id: initial.scope.id.trim() },
        revision: 0,
        contentChecksum: scopedContentChecksum(content),
        content,
      }
    }
    const campus: MemoryCampus = {
      campusId: normalizedCampusId,
      revision: 0,
      scopes,
      receipts: new Map(),
      changes: [],
      checkpoints: new Map(),
    }
    campus.checkpoints.set(0, this.createCheckpoint(campus))
    this.campuses.set(normalizedCampusId, campus)
  }

  async readCampusState(campusId: string): Promise<ScopedCampusState> {
    const campus = this.campuses.get(campusId)
    if (!campus) throw new Error(`Campus not found: ${campusId}`)
    return cloneJson(campusState(campus))
  }

  async findMutation(campusId: string, mutationId: string): Promise<ScopedCommitAcknowledgment | null> {
    const campus = this.campuses.get(campusId)
    const acknowledgment = campus?.receipts.get(mutationId)
    return acknowledgment ? cloneJson(acknowledgment) : null
  }

  async commitAtomically(candidate: ScopedSaveCandidate, actorId: string) {
    const campus = this.campuses.get(candidate.campusId)
    if (!campus) return { status: 'conflict' as const, code: 'CAMPUS_NOT_FOUND' as const }

    const existingReceipt = campus.receipts.get(candidate.mutationId)
    if (existingReceipt) {
      return existingReceipt.requestChecksum === candidate.requestChecksum
        ? { status: 'replayed' as const, acknowledgment: cloneJson(existingReceipt) }
        : { status: 'conflict' as const, code: 'MUTATION_ID_REUSED' as const, currentRevision: campus.revision }
    }
    if (campus.revision !== candidate.expectedCampusRevision) {
      return { status: 'conflict' as const, code: 'STALE_REVISION' as const, currentRevision: campus.revision }
    }

    for (const dependency of candidate.dependencies) {
      const currentDependency = campus.scopes[scopeKey(dependency.scope)]
      if (!currentDependency) {
        if (dependency.required) {
          return { status: 'conflict' as const, code: 'DEPENDENCY_MISSING' as const, currentRevision: campus.revision }
        }
        continue
      }
      if (currentDependency.revision !== dependency.revision || currentDependency.contentChecksum !== dependency.contentChecksum) {
        return { status: 'conflict' as const, code: 'DEPENDENCY_CONFLICT' as const, currentRevision: campus.revision }
      }
    }

    const targetKey = scopeKey(candidate.scope)
    const previous = campus.scopes[targetKey]
    if (previous?.contentChecksum === candidate.contentChecksum) {
      return { status: 'unchanged' as const, revision: campus.revision }
    }
    if (scopedContentChecksum(candidate.content) !== candidate.contentChecksum) {
      throw new Error('Atomic store received candidate content with an invalid checksum.')
    }

    const beforeCampusChecksum = scopesChecksum(campus.campusId, campus.revision, campus.scopes)
    const revision = campus.revision + 1
    const content = cloneJson(candidate.content)
    const afterChecksum = scopedContentChecksum(content)
    const committedAt = this.now()
    const acknowledgment: ScopedCommitAcknowledgment = {
      campusId: campus.campusId,
      revision,
      mutationId: candidate.mutationId,
      requestChecksum: candidate.requestChecksum,
      contentChecksum: candidate.contentChecksum,
      committedAt,
    }
    const nextScopes = {
      ...campus.scopes,
      [targetKey]: {
        scope: cloneJson(candidate.scope),
        revision,
        contentChecksum: afterChecksum,
        content,
      },
    }
    const afterCampusChecksum = scopesChecksum(campus.campusId, revision, nextScopes)
    campus.revision = revision
    campus.scopes = nextScopes
    campus.receipts.set(candidate.mutationId, acknowledgment)
    campus.changes.push({
      kind: 'scoped-change',
      campusId: campus.campusId,
      revision,
      mutationId: candidate.mutationId,
      requestChecksum: candidate.requestChecksum,
      scope: cloneJson(candidate.scope),
      dependencies: cloneJson(candidate.dependencies),
      beforeCampusChecksum,
      afterCampusChecksum,
      operation: {
        kind: 'replace-scope',
        beforeChecksum: previous?.contentChecksum ?? MISSING_CONTENT_CHECKSUM,
        afterChecksum,
        content,
      },
      actorId,
      committedAt,
    })
    if (revision % this.checkpointInterval === 0) {
      campus.checkpoints.set(revision, this.createCheckpoint(campus))
    }
    return { status: 'committed' as const, acknowledgment: cloneJson(acknowledgment) }
  }

  async commitBatchAtomically(
    candidates: readonly ScopedSaveCandidate[],
    actorId: string,
  ): Promise<ScopedBatchAtomicCommitResult> {
    const campusId = candidates[0]?.campusId
    const campus = campusId ? this.campuses.get(campusId) : undefined
    if (!campus) return { status: 'conflict', code: 'CAMPUS_NOT_FOUND' }
    const expectedRevision = candidates[0]?.expectedCampusRevision
    const targetKeys = new Set<string>()
    for (const candidate of candidates) {
      if (
        candidate.campusId !== campus.campusId ||
        candidate.expectedCampusRevision !== expectedRevision ||
        targetKeys.has(scopeKey(candidate.scope)) ||
        scopedContentChecksum(candidate.content) !== candidate.contentChecksum
      ) {
        return { status: 'conflict', code: 'MUTATION_ID_REUSED', currentRevision: campus.revision }
      }
      targetKeys.add(scopeKey(candidate.scope))
    }

    const existingReceipts = candidates.map((candidate) => campus.receipts.get(candidate.mutationId))
    if (existingReceipts.some(Boolean)) {
      if (existingReceipts.some((receipt, index) => !receipt || receipt.requestChecksum !== candidates[index].requestChecksum)) {
        return { status: 'conflict', code: 'MUTATION_ID_REUSED', currentRevision: campus.revision }
      }
      return { status: 'replayed', acknowledgments: cloneJson(existingReceipts as ScopedCommitAcknowledgment[]) }
    }
    if (campus.revision !== expectedRevision) {
      return { status: 'conflict', code: 'STALE_REVISION', currentRevision: campus.revision }
    }

    for (const candidate of candidates) {
      for (const dependency of candidate.dependencies) {
        const currentDependency = campus.scopes[scopeKey(dependency.scope)]
        if (!currentDependency) {
          if (dependency.required) {
            return { status: 'conflict', code: 'DEPENDENCY_MISSING', currentRevision: campus.revision }
          }
          continue
        }
        if (currentDependency.revision !== dependency.revision || currentDependency.contentChecksum !== dependency.contentChecksum) {
          return { status: 'conflict', code: 'DEPENDENCY_CONFLICT', currentRevision: campus.revision }
        }
      }
    }

    const changedCandidates = candidates.filter((candidate) => {
      return campus.scopes[scopeKey(candidate.scope)]?.contentChecksum !== candidate.contentChecksum
    })
    if (changedCandidates.length === 0) return { status: 'unchanged', revision: campus.revision }

    const beforeCampusChecksum = scopesChecksum(campus.campusId, campus.revision, campus.scopes)
    const revision = campus.revision + 1
    const nextScopes = { ...campus.scopes }
    const operations = changedCandidates.map((candidate) => {
      const key = scopeKey(candidate.scope)
      const previous = nextScopes[key]
      const content = cloneJson(candidate.content)
      nextScopes[key] = {
        scope: cloneJson(candidate.scope),
        revision,
        contentChecksum: candidate.contentChecksum,
        content,
      }
      return {
        scope: cloneJson(candidate.scope),
        operation: {
          kind: 'replace-scope' as const,
          beforeChecksum: previous?.contentChecksum ?? MISSING_CONTENT_CHECKSUM,
          afterChecksum: candidate.contentChecksum,
          content,
        },
      }
    })
    const afterCampusChecksum = scopesChecksum(campus.campusId, revision, nextScopes)
    const committedAt = this.now()
    const acknowledgments = candidates.map((candidate): ScopedCommitAcknowledgment => ({
      campusId: campus.campusId,
      revision,
      mutationId: candidate.mutationId,
      requestChecksum: candidate.requestChecksum,
      contentChecksum: candidate.contentChecksum,
      committedAt,
    }))

    campus.revision = revision
    campus.scopes = nextScopes
    candidates.forEach((candidate, index) => campus.receipts.set(candidate.mutationId, acknowledgments[index]))
    campus.changes.push({
      kind: 'scoped-batch',
      campusId: campus.campusId,
      revision,
      scope: cloneJson(operations[0].scope),
      operation: cloneJson(operations[0].operation),
      mutationIds: candidates.map((candidate) => candidate.mutationId),
      requestChecksums: candidates.map((candidate) => candidate.requestChecksum),
      beforeCampusChecksum,
      afterCampusChecksum,
      operations,
      actorId,
      committedAt,
    })
    if (revision % this.checkpointInterval === 0) campus.checkpoints.set(revision, this.createCheckpoint(campus))
    return { status: 'committed', acknowledgments: cloneJson(acknowledgments) }
  }

  getChangeSets(campusId: string): readonly LocalHistoryChangeSet[] {
    return cloneJson(this.requireCampus(campusId).changes)
  }

  getCheckpointRevisions(campusId: string): readonly number[] {
    return [...this.requireCampus(campusId).checkpoints.keys()].sort((a, b) => a - b)
  }

  reconstructCampus(campusId: string, targetRevision: number): ReconstructedCampus {
    const campus = this.requireCampus(campusId)
    if (!Number.isSafeInteger(targetRevision) || targetRevision < 0 || targetRevision > campus.revision) {
      throw new ScopedHistoryIntegrityError(`Revision ${targetRevision} is outside the available campus history.`)
    }
    const checkpoint = [...campus.checkpoints.values()]
      .filter((entry) => entry.revision <= targetRevision)
      .sort((left, right) => right.revision - left.revision)[0]
    if (!checkpoint) throw new ScopedHistoryIntegrityError('No checkpoint exists at or before the requested revision.')
    if (scopesChecksum(checkpoint.campusId, checkpoint.revision, checkpoint.scopes) !== checkpoint.checksum) {
      throw new ScopedHistoryIntegrityError(`Checkpoint ${checkpoint.revision} failed its checksum.`)
    }

    const scopes = cloneJson(checkpoint.scopes)
    let revision = checkpoint.revision
    let campusChecksum = checkpoint.checksum
    const changes = campus.changes
      .filter((change) => change.revision > revision && change.revision <= targetRevision)
      .sort((left, right) => left.revision - right.revision)
    for (const change of changes) {
      if (change.revision !== revision + 1 || change.beforeCampusChecksum !== campusChecksum) {
        throw new ScopedHistoryIntegrityError(`Revision chain is incomplete or inconsistent before revision ${change.revision}.`)
      }
      const operations = change.kind === 'scoped-batch'
        ? change.operations
        : [{ scope: change.scope, operation: change.operation }]
      const appliedScopes = new Set<string>()
      for (const entry of operations) {
        const key = scopeKey(entry.scope)
        if (appliedScopes.has(key)) throw new ScopedHistoryIntegrityError(`Batch repeats scope ${key} at revision ${change.revision}.`)
        appliedScopes.add(key)
        const previous = scopes[key]
        const currentChecksum = previous?.contentChecksum ?? MISSING_CONTENT_CHECKSUM
        if (currentChecksum !== entry.operation.beforeChecksum) {
          throw new ScopedHistoryIntegrityError(`Scope before-checksum failed at campus revision ${change.revision}.`)
        }
        if (scopedContentChecksum(entry.operation.content) !== entry.operation.afterChecksum) {
          throw new ScopedHistoryIntegrityError(`Scope after-checksum failed at campus revision ${change.revision}.`)
        }
        scopes[key] = {
          scope: cloneJson(entry.scope),
          revision: change.revision,
          contentChecksum: entry.operation.afterChecksum,
          content: cloneJson(entry.operation.content),
        }
      }
      revision = change.revision
      campusChecksum = scopesChecksum(campusId, revision, scopes)
      if (campusChecksum !== change.afterCampusChecksum) {
        throw new ScopedHistoryIntegrityError(`Campus checksum failed at revision ${change.revision}.`)
      }
    }
    if (revision !== targetRevision) {
      throw new ScopedHistoryIntegrityError(`Revision history ends at ${revision}; requested ${targetRevision}.`)
    }
    return { campusId, revision, checksum: campusChecksum, scopes }
  }

  tamperCheckpointForTest(campusId: string, revision: number): void {
    const checkpoint = this.requireCampus(campusId).checkpoints.get(revision)
    if (!checkpoint) throw new Error(`Checkpoint ${revision} not found.`)
    checkpoint.checksum = '0'.repeat(64)
  }

  tamperChangeSetForTest(campusId: string, revision: number): void {
    const change = this.requireCampus(campusId).changes.find((entry) => entry.revision === revision)
    if (!change) throw new Error(`Change set ${revision} not found.`)
    if (change.kind === 'scoped-batch') {
      const operation = change.operations[0]?.operation
      if (!operation) throw new Error(`Change set ${revision} has no operations.`)
      operation.afterChecksum = '0'.repeat(64)
    } else {
      change.operation.afterChecksum = '0'.repeat(64)
    }
  }

  private requireCampus(campusId: string): MemoryCampus {
    const campus = this.campuses.get(campusId)
    if (!campus) throw new Error(`Campus not found: ${campusId}`)
    return campus
  }

  private createCheckpoint(campus: MemoryCampus): LocalCampusCheckpoint {
    const scopes = cloneJson(campus.scopes)
    return {
      campusId: campus.campusId,
      revision: campus.revision,
      checksum: scopesChecksum(campus.campusId, campus.revision, scopes),
      scopes,
    }
  }
}
