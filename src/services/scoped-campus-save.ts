import { createHash } from 'node:crypto'

export type ScopedSaveKind = 'building' | 'routing' | 'terrain' | 'campus-settings'

const SCOPED_SAVE_KINDS: readonly ScopedSaveKind[] = ['building', 'routing', 'terrain', 'campus-settings']

export interface ScopedSaveScope {
  kind: ScopedSaveKind
  id: string
}

export interface ScopedSaveDependency {
  scope: ScopedSaveScope
  revision: number
  contentChecksum: string
  required: boolean
}

export interface ScopedSaveCandidate<T = unknown> {
  contractVersion: 1
  campusId: string
  scope: ScopedSaveScope
  expectedCampusRevision: number
  mutationId: string
  requestChecksum: string
  contentChecksum: string
  content: T
  dependencies: readonly ScopedSaveDependency[]
}

export interface CreateScopedSaveCandidateInput<T = unknown> {
  campusId: string
  scope: ScopedSaveScope
  expectedCampusRevision: number
  mutationId: string
  content: T
  dependencies: readonly ScopedSaveDependency[]
}

export interface ScopedCampusState {
  campusId: string
  revision: number
  scopes: Record<string, { revision: number; contentChecksum: string }>
}

export interface ScopedCommitAcknowledgment {
  campusId: string
  revision: number
  mutationId: string
  requestChecksum: string
  contentChecksum: string
  /** Optional for legacy stores; durable stores bind each receipt to its original atomic batch. */
  batchChecksum?: string
  committedAt: string
}

export type ScopedCommitResult =
  | { status: 'committed' | 'replayed'; acknowledgment: ScopedCommitAcknowledgment }
  | { status: 'unchanged'; revision: number }

export interface ScopedCommitStore {
  readCampusState(campusId: string): Promise<ScopedCampusState>
  findMutation(campusId: string, mutationId: string): Promise<ScopedCommitAcknowledgment | null>
  /**
   * Must atomically recheck mutation uniqueness, campus CAS, dependencies and no-op state,
   * then persist the commit and exact idempotency receipt in one transaction.
   */
  commitAtomically(
    candidate: ScopedSaveCandidate,
    actorId: string,
  ): Promise<ScopedAtomicCommitResult>
}

export type ScopedAtomicConflictCode =
  | 'CAMPUS_NOT_FOUND'
  | 'MUTATION_ID_REUSED'
  | 'STALE_REVISION'
  | 'DEPENDENCY_MISSING'
  | 'DEPENDENCY_CONFLICT'

export type ScopedAtomicCommitResult =
  | { status: 'committed'; acknowledgment: ScopedCommitAcknowledgment }
  | { status: 'replayed'; acknowledgment: ScopedCommitAcknowledgment }
  | { status: 'unchanged'; revision: number }
  | { status: 'conflict'; code: ScopedAtomicConflictCode; currentRevision?: number }

export type ScopedBatchAtomicCommitResult =
  | { status: 'committed' | 'replayed'; acknowledgments: ScopedCommitAcknowledgment[] }
  | { status: 'unchanged'; revision: number }
  | { status: 'conflict'; code: ScopedAtomicConflictCode; currentRevision?: number }

export interface ScopedBatchCommitStore extends ScopedCommitStore {
  /** Atomically commits every candidate at one campus revision or commits none. */
  commitBatchAtomically(
    candidates: readonly ScopedSaveCandidate[],
    actorId: string,
  ): Promise<ScopedBatchAtomicCommitResult>
}

export type ScopedBatchCommitResult =
  | { status: 'committed' | 'replayed'; revision: number; acknowledgments: ScopedCommitAcknowledgment[] }
  | { status: 'unchanged'; revision: number }

export interface ScopedCommitActor {
  actorId: string
  isAdministrator: boolean
}

export type ScopedCommitErrorCode =
  | 'INVALID_CANDIDATE'
  | 'UNAUTHORIZED'
  | 'MUTATION_ID_REUSED'
  | 'BATCH_REPLAY_INTEGRITY_FAILURE'
  | 'CAMPUS_NOT_FOUND'
  | 'STALE_REVISION'
  | 'DEPENDENCY_MISSING'
  | 'DEPENDENCY_CONFLICT'
  | 'INVALID_ACKNOWLEDGMENT'

export class ScopedCommitError extends Error {
  constructor(readonly code: ScopedCommitErrorCode, message: string) {
    super(message)
    this.name = 'ScopedCommitError'
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value as Record<string, unknown>).forEach(deepFreeze)
  }
  return value
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value === null || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const entry = (value as Record<string, unknown>)[key]
    if (entry !== undefined) result[key] = canonicalize(entry)
  }
  return result
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

export function scopedContentChecksum(value: unknown): string {
  return checksum(value)
}

/** Canonical identity for a single or multi-scope commit; member order is not significant. */
export function scopedBatchChecksum(candidates: readonly ScopedSaveCandidate[]): string {
  const first = candidates[0]
  if (!first) throw new ScopedCommitError('INVALID_CANDIDATE', 'A batch identity requires at least one candidate.')
  const members = candidates.map((candidate) => ({
    mutationId: candidate.mutationId,
    requestChecksum: candidate.requestChecksum,
    contentChecksum: candidate.contentChecksum,
    scope: candidate.scope,
  })).sort((left, right) => left.mutationId < right.mutationId ? -1 : left.mutationId > right.mutationId ? 1 : 0)
  return checksum({
    contractVersion: 1,
    campusId: first.campusId,
    expectedCampusRevision: first.expectedCampusRevision,
    members,
  })
}

function isScopedSaveScope(value: unknown): value is ScopedSaveScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const scope = value as Partial<ScopedSaveScope>
  return SCOPED_SAVE_KINDS.includes(scope.kind as ScopedSaveKind) && typeof scope.id === 'string' && Boolean(scope.id.trim())
}

function normalizeDependencies(value: unknown): ScopedSaveDependency[] {
  if (!Array.isArray(value)) {
    throw new ScopedCommitError('INVALID_CANDIDATE', 'Dependencies must be an array.')
  }
  const dependencies = value.map((entry): ScopedSaveDependency => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ScopedCommitError('INVALID_CANDIDATE', 'Each dependency must be an object.')
    }
    const dependency = entry as Partial<ScopedSaveDependency>
    if (
      !isScopedSaveScope(dependency.scope) ||
      !Number.isSafeInteger(dependency.revision) ||
      (dependency.revision as number) < 0 ||
      typeof dependency.contentChecksum !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(dependency.contentChecksum) ||
      typeof dependency.required !== 'boolean'
    ) {
      throw new ScopedCommitError('INVALID_CANDIDATE', 'Dependency scope, revision, checksum, or required flag is invalid.')
    }
    return {
      scope: { kind: dependency.scope.kind, id: dependency.scope.id.trim() },
      revision: dependency.revision as number,
      contentChecksum: dependency.contentChecksum.toLowerCase(),
      required: dependency.required,
    }
  })
  dependencies.sort((a, b) => {
    const left = `${a.scope.kind}\u0000${a.scope.id}`
    const right = `${b.scope.kind}\u0000${b.scope.id}`
    return left < right ? -1 : left > right ? 1 : 0
  })
  for (let index = 1; index < dependencies.length; index += 1) {
    const previous = dependencies[index - 1]
    const current = dependencies[index]
    if (previous.scope.kind === current.scope.kind && previous.scope.id === current.scope.id) {
      throw new ScopedCommitError('INVALID_CANDIDATE', 'A dependency scope may only appear once in a candidate.')
    }
  }
  return dependencies
}

function validateCandidate(candidate: ScopedSaveCandidate): void {
  if (
    !candidate ||
    candidate.contractVersion !== 1 ||
    typeof candidate.campusId !== 'string' ||
    !candidate.campusId.trim() ||
    candidate.campusId !== candidate.campusId.trim() ||
    !isScopedSaveScope(candidate.scope) ||
    candidate.scope.id !== candidate.scope.id.trim() ||
    !Number.isSafeInteger(candidate.expectedCampusRevision) ||
    candidate.expectedCampusRevision < 0 ||
    typeof candidate.mutationId !== 'string' ||
    !candidate.mutationId.trim() ||
    candidate.mutationId !== candidate.mutationId.trim() ||
    typeof candidate.contentChecksum !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(candidate.contentChecksum) ||
    typeof candidate.requestChecksum !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(candidate.requestChecksum)
  ) {
    throw new ScopedCommitError('INVALID_CANDIDATE', 'The scoped save candidate is invalid.')
  }
  const normalizedDependencies = normalizeDependencies(candidate.dependencies)
  if (JSON.stringify(normalizedDependencies) !== JSON.stringify(candidate.dependencies)) {
    throw new ScopedCommitError('INVALID_CANDIDATE', 'Candidate dependencies must be normalized and deterministically sorted.')
  }
}

function calculateRequestChecksum(input: Pick<ScopedSaveCandidate, 'contractVersion' | 'campusId' | 'scope' | 'expectedCampusRevision' | 'mutationId' | 'contentChecksum' | 'dependencies'>): string {
  return checksum({
    contractVersion: input.contractVersion,
    campusId: input.campusId,
    scope: input.scope,
    expectedCampusRevision: input.expectedCampusRevision,
    mutationId: input.mutationId,
    contentChecksum: input.contentChecksum,
    dependencies: input.dependencies,
  })
}

export function createScopedSaveCandidate<T>(input: CreateScopedSaveCandidateInput<T>): ScopedSaveCandidate<T> {
  const campusId = typeof input.campusId === 'string' ? input.campusId.trim() : ''
  const scopeId = typeof input.scope?.id === 'string' ? input.scope.id.trim() : ''
  const mutationId = typeof input.mutationId === 'string' ? input.mutationId.trim() : ''
  if (!campusId || !scopeId || !mutationId || !isScopedSaveScope(input.scope) || !Number.isSafeInteger(input.expectedCampusRevision) || input.expectedCampusRevision < 0) {
    throw new ScopedCommitError('INVALID_CANDIDATE', 'Campus, scope, mutation identity, and a non-negative expected revision are required.')
  }
  let content: T
  try {
    content = cloneJson(input.content)
  } catch {
    throw new ScopedCommitError('INVALID_CANDIDATE', 'Candidate content must be valid JSON data.')
  }
  const scope = { ...input.scope, id: scopeId }
  const dependencies = normalizeDependencies(input.dependencies)
  const contentChecksum = checksum(content)
  const requestChecksum = calculateRequestChecksum({
    contractVersion: 1,
    campusId,
    scope,
    expectedCampusRevision: input.expectedCampusRevision,
    mutationId,
    contentChecksum,
    dependencies,
  })
  return deepFreeze({
    contractVersion: 1 as const,
    campusId,
    scope,
    expectedCampusRevision: input.expectedCampusRevision,
    mutationId,
    requestChecksum,
    contentChecksum,
    content,
    dependencies,
  })
}

function scopeKey(scope: ScopedSaveScope): string {
  return `${scope.kind}:${scope.id}`
}

export function verifyScopedCommitAcknowledgment(candidate: ScopedSaveCandidate, acknowledgment: ScopedCommitAcknowledgment): boolean {
  if (
    acknowledgment.campusId !== candidate.campusId ||
    acknowledgment.mutationId !== candidate.mutationId ||
    acknowledgment.requestChecksum !== candidate.requestChecksum ||
    acknowledgment.contentChecksum !== candidate.contentChecksum ||
    !Number.isSafeInteger(acknowledgment.revision) ||
    acknowledgment.revision !== candidate.expectedCampusRevision + 1 ||
    typeof acknowledgment.committedAt !== 'string' ||
    !Number.isFinite(Date.parse(acknowledgment.committedAt)) ||
    (acknowledgment.batchChecksum !== undefined && !/^[a-f0-9]{64}$/.test(acknowledgment.batchChecksum))
  ) {
    return false
  }
  return true
}

function validateSingleBatchBinding(candidate: ScopedSaveCandidate, acknowledgment: ScopedCommitAcknowledgment): void {
  if (acknowledgment.batchChecksum !== undefined && acknowledgment.batchChecksum !== scopedBatchChecksum([candidate])) {
    throw new ScopedCommitError('BATCH_REPLAY_INTEGRITY_FAILURE', 'The mutation receipt belongs to a different original batch.')
  }
}

export function verifyScopedBatchAcknowledgments(candidates: readonly ScopedSaveCandidate[], acknowledgments: readonly ScopedCommitAcknowledgment[]): boolean {
  if (candidates.length < 2 || acknowledgments.length !== candidates.length) return false
  if (acknowledgments.some((acknowledgment, index) => !verifyScopedCommitAcknowledgment(candidates[index], acknowledgment))) return false
  const boundCount = acknowledgments.filter((acknowledgment) => acknowledgment.batchChecksum !== undefined).length
  if (boundCount === 0) return true // Backward compatibility with legacy in-memory/reference stores.
  const expectedBatchChecksum = scopedBatchChecksum(candidates)
  return !(
    boundCount !== acknowledgments.length ||
    acknowledgments.some((acknowledgment) => acknowledgment.batchChecksum !== expectedBatchChecksum)
  )
}

function validateAcknowledgment(candidate: ScopedSaveCandidate, acknowledgment: ScopedCommitAcknowledgment): void {
  if (!verifyScopedCommitAcknowledgment(candidate, acknowledgment)) {
    throw new ScopedCommitError('INVALID_ACKNOWLEDGMENT', 'The server acknowledgment does not exactly identify the submitted commit.')
  }
}

function validateBatchReceiptBinding(candidates: readonly ScopedSaveCandidate[], acknowledgments: readonly ScopedCommitAcknowledgment[]): void {
  if (!verifyScopedBatchAcknowledgments(candidates, acknowledgments)) {
    throw new ScopedCommitError('BATCH_REPLAY_INTEGRITY_FAILURE', 'The mutation receipts do not share this exact canonical batch identity.')
  }
}

export async function commitScopedCandidate(
  candidate: ScopedSaveCandidate,
  actor: ScopedCommitActor,
  store: ScopedCommitStore,
): Promise<ScopedCommitResult> {
  validateCandidate(candidate)
  let contentChecksum: string
  try {
    contentChecksum = checksum(candidate.content)
  } catch {
    throw new ScopedCommitError('INVALID_CANDIDATE', 'Candidate content must be valid JSON data.')
  }
  if (contentChecksum !== candidate.contentChecksum || calculateRequestChecksum(candidate) !== candidate.requestChecksum) {
    throw new ScopedCommitError('INVALID_CANDIDATE', 'Candidate content or request checksum does not match the submitted payload.')
  }
  if (!actor?.isAdministrator || !actor.actorId.trim()) {
    throw new ScopedCommitError('UNAUTHORIZED', 'Administrator authorization is required for campus persistence.')
  }

  const previous = await store.findMutation(candidate.campusId, candidate.mutationId)
  if (previous) {
    if (previous.requestChecksum !== candidate.requestChecksum) {
      throw new ScopedCommitError('MUTATION_ID_REUSED', 'This mutation id is already bound to a different request checksum.')
    }
    validateAcknowledgment(candidate, previous)
    validateSingleBatchBinding(candidate, previous)
    return { status: 'replayed', acknowledgment: previous }
  }

  const current = await store.readCampusState(candidate.campusId)
  if (current.campusId !== candidate.campusId) {
    throw new ScopedCommitError('CAMPUS_NOT_FOUND', 'The server returned state for a different campus.')
  }
  if (current.revision !== candidate.expectedCampusRevision) {
    throw new ScopedCommitError('STALE_REVISION', `Expected campus revision ${candidate.expectedCampusRevision}, current revision is ${current.revision}.`)
  }

  for (const dependency of candidate.dependencies) {
    const currentDependency = current.scopes[scopeKey(dependency.scope)]
    if (!currentDependency) {
      if (dependency.required) throw new ScopedCommitError('DEPENDENCY_MISSING', `Required dependency ${scopeKey(dependency.scope)} is missing.`)
      continue
    }
    if (currentDependency.revision !== dependency.revision || currentDependency.contentChecksum !== dependency.contentChecksum) {
      throw new ScopedCommitError('DEPENDENCY_CONFLICT', `Dependency ${scopeKey(dependency.scope)} changed after candidate capture.`)
    }
  }

  const committed = await store.commitAtomically(candidate, actor.actorId)
  if (committed.status === 'conflict') {
    const messages: Record<ScopedAtomicConflictCode, string> = {
      CAMPUS_NOT_FOUND: 'Campus does not exist.',
      MUTATION_ID_REUSED: 'This mutation id is already bound to a different request checksum.',
      STALE_REVISION: `Atomic campus compare-and-swap failed at revision ${committed.currentRevision}.`,
      DEPENDENCY_MISSING: 'A required dependency is missing at commit time.',
      DEPENDENCY_CONFLICT: 'A dependency changed before the atomic commit.',
    }
    throw new ScopedCommitError(committed.code, messages[committed.code])
  }
  if (committed.status === 'unchanged') {
    if (committed.revision !== candidate.expectedCampusRevision) {
      throw new ScopedCommitError('STALE_REVISION', 'Atomic no-op confirmation did not match the submitted campus revision.')
    }
    return { status: 'unchanged', revision: committed.revision }
  }
  if (committed.status === 'replayed') {
    validateAcknowledgment(candidate, committed.acknowledgment)
    validateSingleBatchBinding(candidate, committed.acknowledgment)
    return { status: 'replayed', acknowledgment: committed.acknowledgment }
  }
  validateAcknowledgment(candidate, committed.acknowledgment)
  validateSingleBatchBinding(candidate, committed.acknowledgment)
  return { status: 'committed', acknowledgment: committed.acknowledgment }
}

/** Validate and atomically commit a multi-scope edit as one campus revision. */
export async function commitScopedBatch(
  candidates: readonly ScopedSaveCandidate[],
  actor: ScopedCommitActor,
  store: ScopedBatchCommitStore,
): Promise<ScopedBatchCommitResult> {
  if (candidates.length < 2) {
    throw new ScopedCommitError('INVALID_CANDIDATE', 'A scoped batch must contain at least two scope candidates.')
  }
  if (!actor?.isAdministrator || !actor.actorId.trim()) {
    throw new ScopedCommitError('UNAUTHORIZED', 'Administrator authorization is required for campus persistence.')
  }
  const campusId = candidates[0]?.campusId
  const expectedRevision = candidates[0]?.expectedCampusRevision
  const mutationIds = new Set<string>()
  const scopeIds = new Set<string>()
  for (const candidate of candidates) {
    validateCandidate(candidate)
    let actualContentChecksum: string
    try {
      actualContentChecksum = checksum(candidate.content)
    } catch {
      throw new ScopedCommitError('INVALID_CANDIDATE', 'Candidate content must be valid JSON data.')
    }
    if (
      actualContentChecksum !== candidate.contentChecksum ||
      calculateRequestChecksum(candidate) !== candidate.requestChecksum ||
      candidate.campusId !== campusId ||
      candidate.expectedCampusRevision !== expectedRevision
    ) {
      throw new ScopedCommitError('INVALID_CANDIDATE', 'Batch candidates must be valid and share one campus revision.')
    }
    const key = scopeKey(candidate.scope)
    if (mutationIds.has(candidate.mutationId) || scopeIds.has(key)) {
      throw new ScopedCommitError('INVALID_CANDIDATE', 'A scoped batch cannot repeat mutation ids or target scopes.')
    }
    mutationIds.add(candidate.mutationId)
    scopeIds.add(key)
  }

  const existingReceipts = await Promise.all(candidates.map((candidate) => store.findMutation(campusId, candidate.mutationId)))
  if (existingReceipts.some(Boolean)) {
    if (existingReceipts.some((receipt) => !receipt)) {
      if (existingReceipts.some((receipt) => receipt?.batchChecksum !== undefined)) {
        throw new ScopedCommitError('BATCH_REPLAY_INTEGRITY_FAILURE', 'Only part of the original atomic batch has a stored receipt.')
      }
      throw new ScopedCommitError('MUTATION_ID_REUSED', 'Only part of this scoped batch has a stored receipt.')
    }
    const acknowledgments = existingReceipts as ScopedCommitAcknowledgment[]
    acknowledgments.forEach((acknowledgment, index) => {
      const candidate = candidates[index]
      if (acknowledgment.requestChecksum !== candidate.requestChecksum) {
        throw new ScopedCommitError('MUTATION_ID_REUSED', 'A batch mutation id is already bound to a different request checksum.')
      }
      validateAcknowledgment(candidate, acknowledgment)
    })
    validateBatchReceiptBinding(candidates, acknowledgments)
    return { status: 'replayed', revision: acknowledgments[0].revision, acknowledgments }
  }

  const current = await store.readCampusState(campusId)
  if (current.campusId !== campusId) {
    throw new ScopedCommitError('CAMPUS_NOT_FOUND', 'The local store returned state for a different campus.')
  }
  if (current.revision !== expectedRevision) {
    throw new ScopedCommitError('STALE_REVISION', `Expected campus revision ${expectedRevision}, current revision is ${current.revision}.`)
  }
  for (const candidate of candidates) {
    for (const dependency of candidate.dependencies) {
      const currentDependency = current.scopes[scopeKey(dependency.scope)]
      if (!currentDependency) {
        if (dependency.required) throw new ScopedCommitError('DEPENDENCY_MISSING', `Required dependency ${scopeKey(dependency.scope)} is missing.`)
        continue
      }
      if (currentDependency.revision !== dependency.revision || currentDependency.contentChecksum !== dependency.contentChecksum) {
        throw new ScopedCommitError('DEPENDENCY_CONFLICT', `Dependency ${scopeKey(dependency.scope)} changed after candidate capture.`)
      }
    }
  }

  const committed = await store.commitBatchAtomically(candidates, actor.actorId)
  if (committed.status === 'conflict') {
    throw new ScopedCommitError(committed.code, `Atomic scoped batch was rejected: ${committed.code}.`)
  }
  if (committed.status === 'unchanged') {
    if (committed.revision !== expectedRevision) {
      throw new ScopedCommitError('STALE_REVISION', 'Atomic no-op confirmation did not match the submitted campus revision.')
    }
    return { status: 'unchanged', revision: committed.revision }
  }
  if (committed.acknowledgments.length !== candidates.length) {
    throw new ScopedCommitError('INVALID_ACKNOWLEDGMENT', 'The local batch returned an incomplete acknowledgment set.')
  }
  committed.acknowledgments.forEach((acknowledgment, index) => validateAcknowledgment(candidates[index], acknowledgment))
  validateBatchReceiptBinding(candidates, committed.acknowledgments)
  const revision = committed.acknowledgments[0]?.revision
  if (!Number.isSafeInteger(revision) || committed.acknowledgments.some((acknowledgment) => acknowledgment.revision !== revision)) {
    throw new ScopedCommitError('INVALID_ACKNOWLEDGMENT', 'Every local batch operation must acknowledge one shared revision.')
  }
  return { status: committed.status, revision, acknowledgments: committed.acknowledgments }
}

export interface LegacyRevisionCheckpoint<T = unknown> {
  format: 'legacy-full-snapshot-v1'
  campusId: string
  revision: number
  checksum: string
  snapshot: T
}

export function createLegacyRevisionCheckpoint<T extends { campusId: string; revision: number }>(
  legacySnapshot: T,
): LegacyRevisionCheckpoint<T> {
  if (!legacySnapshot.campusId || !Number.isSafeInteger(legacySnapshot.revision) || legacySnapshot.revision < 0) {
    throw new ScopedCommitError('INVALID_CANDIDATE', 'Legacy snapshot requires campus identity and a non-negative revision.')
  }
  const snapshot = cloneJson(legacySnapshot)
  return deepFreeze({
    format: 'legacy-full-snapshot-v1' as const,
    campusId: legacySnapshot.campusId,
    revision: legacySnapshot.revision,
    checksum: checksum(snapshot),
    snapshot,
  })
}

export function reconstructLegacyCheckpoint<T>(checkpoint: LegacyRevisionCheckpoint<T>): T {
  if (!checkpoint || checkpoint.format !== 'legacy-full-snapshot-v1' || checksum(checkpoint.snapshot) !== checkpoint.checksum) {
    throw new ScopedCommitError('INVALID_CANDIDATE', 'Legacy revision checkpoint is malformed or has been altered.')
  }
  return cloneJson(checkpoint.snapshot)
}
