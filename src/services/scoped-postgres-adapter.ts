import {
  createScopedSaveCandidate,
  scopedContentChecksum,
  ScopedCommitError,
  scopedBatchChecksum,
  type ScopedAtomicCommitResult,
  type ScopedBatchAtomicCommitResult,
  type ScopedBatchCommitStore,
  type ScopedCampusState,
  type ScopedCommitAcknowledgment,
  type ScopedSaveCandidate,
  type ScopedSaveScope,
} from './scoped-campus-save'

export interface ScopedPgQueryResult<Row = Record<string, unknown>> {
  rows: Row[]
  rowCount?: number | null
}

/** Minimal pg-compatible surface. Production packages remain injected, not imported. */
export interface ScopedPgClient {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<ScopedPgQueryResult<Row>>
  release(error?: Error): void
}

export interface ScopedPgPool {
  connect(): Promise<ScopedPgClient>
}

export interface ScopedPostgresCommitContext {
  actorId: string
  campusId: string
  documentId: string
  permission: 'read' | 'write'
}

export interface ScopedPostgresAdapterOptions {
  pool: ScopedPgPool
  /** Resolves the authenticated principal from trusted server request context. */
  resolveTrustedActor(): string | null | Promise<string | null>
  /** Resolves the canonical document identity from trusted server state. */
  resolveDocumentId(campusId: string): string | null | Promise<string | null>
  /** Must authorize a trusted principal for the requested permission, never client role claims. */
  authorizeActor(context: ScopedPostgresCommitContext): boolean | Promise<boolean>
  statementTimeoutMs?: number
  lockTimeoutMs?: number
  checkpointInterval?: number
}

export type ScopedPostgresAdapterErrorCode =
  | 'AUTHORIZATION_DENIED'
  | 'DOCUMENT_IDENTITY_MISMATCH'
  | 'CAMPUS_ALREADY_INITIALIZED'
  | 'CHECKPOINT_NOT_FOUND'
  | 'HISTORY_INTEGRITY_FAILURE'
  | 'BATCH_REPLAY_INTEGRITY_FAILURE'
  | 'REVISION_EXHAUSTED'
  | 'LOCK_TIMEOUT'
  | 'STATEMENT_TIMEOUT'
  | 'RETRYABLE_TRANSACTION_FAILURE'
  | 'COMMIT_OUTCOME_UNKNOWN'
  | 'DATABASE_FAILURE'
  | 'ROLLBACK_FAILURE'

export class ScopedPostgresAdapterError extends Error {
  readonly causeValue?: unknown
  readonly rollbackCause?: unknown

  constructor(
    readonly code: ScopedPostgresAdapterErrorCode,
    message: string,
    causeValue?: unknown,
    rollbackCause?: unknown,
  ) {
    super(message)
    this.name = 'ScopedPostgresAdapterError'
    this.causeValue = causeValue
    this.rollbackCause = rollbackCause
  }
}

export interface ScopedPostgresStoredScope {
  scope: ScopedSaveScope
  revision: number
  contentChecksum: string
  content: unknown
}

export interface ScopedPostgresReconstructedCampus {
  campusId: string
  revision: number
  checksum: string
  scopes: Record<string, ScopedPostgresStoredScope>
}

export interface ScopedPostgresSeedScope {
  scope: ScopedSaveScope
  content: unknown
}

interface HeadRow {
  campus_id: string
  document_id: string
  revision: string | number
  head_checksum: string
  updated_at?: string | Date
}

interface ScopeRow {
  scope_kind: ScopedSaveScope['kind']
  scope_id: string
  revision: string | number
  content_checksum: string
  content_json: unknown
}

interface ReceiptRow {
  mutation_id: string
  request_checksum: string
  content_checksum: string
  batch_checksum: string
  revision: string | number
  committed_at: string | Date
}

interface CheckpointRow {
  revision: string | number
  scope_count: number
  snapshot_checksum: string
  snapshot_json: unknown
}

interface ReconstructionRow {
  revision: string | number
  before_head_checksum: string
  after_head_checksum: string
  operation_count: number
  operation_index: number
  scope_kind: ScopedSaveScope['kind']
  scope_id: string
  before_checksum: string
  after_checksum: string
  content_json: unknown
}

interface CampusSnapshot {
  campusId: string
  revision: number
  scopes: Record<string, ScopedPostgresStoredScope>
}

const MISSING_SCOPE_CHECKSUM = scopedContentChecksum({ kind: 'missing-scope-content-v1' })
const ALLOWED_SCOPE_KINDS = new Set<ScopedSaveScope['kind']>([
  'building', 'routing', 'terrain', 'campus-settings',
])

const SQL = {
  setTimeouts: `SELECT
    set_config('statement_timeout', $1, true) AS statement_timeout,
    set_config('lock_timeout', $2, true) AS lock_timeout`,
  lockCampus: `SELECT pg_advisory_xact_lock(hashtextextended('navi-scoped:' || $1, 0))`,
  lockHead: `SELECT campus_id, document_id, revision::text AS revision, head_checksum, updated_at
    FROM navi_scoped.campus_heads WHERE campus_id = $1 FOR UPDATE`,
  readHead: `SELECT campus_id, document_id, revision::text AS revision, head_checksum, updated_at
    FROM navi_scoped.campus_heads WHERE campus_id = $1`,
  findReceipt: `SELECT mutation_id, request_checksum, content_checksum, batch_checksum, revision::text AS revision, committed_at
    FROM navi_scoped.mutation_receipts WHERE campus_id = $1 AND mutation_id = $2`,
  readScopes: `SELECT scope_kind, scope_id, revision::text AS revision, content_checksum, content_json
    FROM navi_scoped.scope_heads WHERE campus_id = $1 ORDER BY scope_kind, scope_id`,
  readReceipts: `SELECT mutation_id, request_checksum, content_checksum, batch_checksum, revision::text AS revision, committed_at
    FROM navi_scoped.mutation_receipts WHERE campus_id = $1 AND mutation_id = ANY($2::text[])`,
  insertCampus: `INSERT INTO navi_scoped.campus_heads
    (campus_id, document_id, revision, head_checksum, created_by)
    VALUES ($1, $2, 0, $3, $4)`,
  insertScope: `INSERT INTO navi_scoped.scope_heads
    (campus_id, scope_kind, scope_id, revision, content_checksum, content_json)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
  insertChangeSet: `INSERT INTO navi_scoped.change_sets
    (campus_id, revision, batch_checksum, before_head_checksum, after_head_checksum, operation_count, actor_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING committed_at`,
  upsertScope: `INSERT INTO navi_scoped.scope_heads
    (campus_id, scope_kind, scope_id, revision, content_checksum, content_json)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    ON CONFLICT (campus_id, scope_kind, scope_id) DO UPDATE SET
      revision = EXCLUDED.revision,
      content_checksum = EXCLUDED.content_checksum,
      content_json = EXCLUDED.content_json,
      updated_at = transaction_timestamp()`,
  insertOperation: `INSERT INTO navi_scoped.change_operations
    (campus_id, revision, operation_index, mutation_id, scope_kind, scope_id,
     before_checksum, after_checksum, content_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
  insertDependency: `INSERT INTO navi_scoped.change_dependencies
    (campus_id, revision, operation_index, dependency_index, scope_kind, scope_id,
     expected_revision, expected_checksum, required)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
  insertReceipt: `INSERT INTO navi_scoped.mutation_receipts
    (campus_id, mutation_id, request_checksum, content_checksum, revision, operation_index, batch_checksum, committed_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
  updateHead: `UPDATE navi_scoped.campus_heads
    SET revision = $2, head_checksum = $3, updated_at = $4
    WHERE campus_id = $1`,
  insertCheckpoint: `INSERT INTO navi_scoped.checkpoints
    (campus_id, revision, format_version, scope_count, snapshot_checksum, snapshot_json)
    VALUES ($1, $2, 1, $3, $4, $5::jsonb)`,
  readCheckpoint: `SELECT revision::text AS revision, scope_count, snapshot_checksum, snapshot_json
    FROM navi_scoped.checkpoints
    WHERE campus_id = $1 AND revision <= $2
    ORDER BY revision DESC LIMIT 1`,
  readHistory: `SELECT cs.revision::text AS revision, cs.before_head_checksum, cs.after_head_checksum, cs.operation_count,
      op.operation_index, op.scope_kind, op.scope_id, op.before_checksum, op.after_checksum, op.content_json
    FROM navi_scoped.change_sets AS cs
    JOIN navi_scoped.change_operations AS op USING (campus_id, revision)
    WHERE cs.campus_id = $1 AND cs.revision > $2 AND cs.revision <= $3
    ORDER BY cs.revision, op.operation_index`,
} as const

function scopeKey(scope: ScopedSaveScope): string {
  return `${scope.kind}:${scope.id}`
}

function toSafeRevision(value: string | number): number {
  const revision = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'The stored campus revision is invalid.')
  }
  return revision
}

function asIsoString(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'The stored commit timestamp is invalid.')
  }
  return date.toISOString()
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'Stored JSONB content could not be decoded.')
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function orderedScopes(scopes: Record<string, ScopedPostgresStoredScope>): Record<string, ScopedPostgresStoredScope> {
  return Object.fromEntries(
    Object.entries(scopes).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
  )
}

function campusChecksum(campusId: string, revision: number, scopes: Record<string, ScopedPostgresStoredScope>): string {
  return scopedContentChecksum({ campusId, revision, scopes: orderedScopes(scopes) })
}

function makeSnapshot(campusId: string, revision: number, scopes: Record<string, ScopedPostgresStoredScope>): CampusSnapshot {
  return { campusId, revision, scopes: orderedScopes(cloneJson(scopes)) }
}

function validateScope(scope: ScopedSaveScope): void {
  if (
    !scope ||
    !ALLOWED_SCOPE_KINDS.has(scope.kind) ||
    typeof scope.id !== 'string' ||
    scope.id.length === 0 ||
    scope.id !== scope.id.trim() ||
    scope.id.length > 256
  ) {
    throw new ScopedCommitError('INVALID_CANDIDATE', 'A scoped persistence operation has an invalid scope identity.')
  }
}

function validateCandidate(candidate: ScopedSaveCandidate): void {
  let rebuilt: ScopedSaveCandidate
  try {
    rebuilt = createScopedSaveCandidate({
      campusId: candidate.campusId,
      scope: candidate.scope,
      expectedCampusRevision: candidate.expectedCampusRevision,
      mutationId: candidate.mutationId,
      content: candidate.content,
      dependencies: candidate.dependencies,
    })
  } catch (error) {
    throw error instanceof ScopedCommitError
      ? error
      : new ScopedCommitError('INVALID_CANDIDATE', error instanceof Error ? error.message : 'The scoped save candidate is invalid.')
  }
  if (
    rebuilt.contentChecksum !== candidate.contentChecksum ||
    rebuilt.requestChecksum !== candidate.requestChecksum
  ) {
    throw new ScopedCommitError('INVALID_CANDIDATE', 'The scoped save candidate checksum does not match its payload.')
  }
}

function scopeRowsToMap(rows: readonly ScopeRow[]): Record<string, ScopedPostgresStoredScope> {
  const scopes: Record<string, ScopedPostgresStoredScope> = {}
  for (const row of rows) {
    const scope: ScopedSaveScope = { kind: row.scope_kind, id: row.scope_id }
    try {
      validateScope(scope)
    } catch {
      throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'A stored scope identity is invalid.')
    }
    const content = parseJsonValue(row.content_json)
    if (scopedContentChecksum(content) !== row.content_checksum) {
      throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', `Scope ${scopeKey(scope)} failed its checksum.`)
    }
    scopes[scopeKey(scope)] = {
      scope,
      revision: toSafeRevision(row.revision),
      contentChecksum: row.content_checksum,
      content,
    }
  }
  return scopes
}

function stateFromHead(head: HeadRow, scopes: Record<string, ScopedPostgresStoredScope>): ScopedCampusState {
  const revision = toSafeRevision(head.revision)
  if (Object.values(scopes).some((scope) => scope.revision > revision)) {
    throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'A scoped document revision is newer than its campus head.')
  }
  const expectedChecksum = campusChecksum(head.campus_id, revision, scopes)
  if (expectedChecksum !== head.head_checksum) {
    throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'The campus head checksum does not match its scoped state.')
  }
  return {
    campusId: head.campus_id,
    revision,
    scopes: Object.fromEntries(Object.entries(scopes).map(([key, scope]) => [key, {
      revision: scope.revision,
      contentChecksum: scope.contentChecksum,
    }])) as ScopedCampusState['scopes'],
  }
}

function receiptToAcknowledgment(row: ReceiptRow): ScopedCommitAcknowledgment {
  return {
    campusId: '', // Filled by the caller, which is already scoped by campus_id.
    revision: toSafeRevision(row.revision),
    mutationId: row.mutation_id,
    requestChecksum: row.request_checksum,
    contentChecksum: row.content_checksum,
    batchChecksum: row.batch_checksum,
    committedAt: asIsoString(row.committed_at),
  }
}

function assertAuthorizedIdentity(campusId: string, documentId: string | null): asserts documentId is string {
  if (
    typeof campusId !== 'string' || campusId.length === 0 || campusId !== campusId.trim() || campusId.length > 256 ||
    typeof documentId !== 'string' || documentId.length === 0 || documentId !== documentId.trim() || documentId.length > 320
  ) {
    throw new ScopedPostgresAdapterError('DOCUMENT_IDENTITY_MISMATCH', 'The server could not resolve a valid campus/document identity.')
  }
}

function isSqlState(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code)
}

/** Stable batch identity, independent of caller ordering but bound to every mutation request. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function checkpointSnapshot(value: unknown, campusId: string, revision: number, scopeCount: number, expectedChecksum: string): CampusSnapshot {
  if (!isRecord(value) || !isRecord(value.scopes) || value.campusId !== campusId || value.revision !== revision) {
    throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'The stored checkpoint has an invalid snapshot shape or identity.')
  }
  const scopes: Record<string, ScopedPostgresStoredScope> = {}
  for (const [key, valueEntry] of Object.entries(value.scopes)) {
    if (!isRecord(valueEntry) || !isRecord(valueEntry.scope) || !Object.prototype.hasOwnProperty.call(valueEntry, 'content')) {
      throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'The stored checkpoint contains an invalid scope record.')
    }
    const scope = valueEntry.scope as unknown as ScopedSaveScope
    try {
      validateScope(scope)
    } catch {
      throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'The stored checkpoint contains an invalid scope identity.')
    }
    const scopeRevision = valueEntry.revision
    const contentChecksum = valueEntry.contentChecksum
    let actualContentChecksum: string
    try {
      actualContentChecksum = scopedContentChecksum(valueEntry.content)
    } catch {
      throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'The stored checkpoint contains non-JSON scope content.')
    }
    if (
      key !== scopeKey(scope) ||
      typeof scopeRevision !== 'number' || !Number.isSafeInteger(scopeRevision) || scopeRevision < 0 || scopeRevision > revision ||
      typeof contentChecksum !== 'string' || !/^[a-f0-9]{64}$/.test(contentChecksum) ||
      actualContentChecksum !== contentChecksum
    ) {
      throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'The stored checkpoint contains a scope with invalid identity, revision, or checksum.')
    }
    scopes[key] = { scope, revision: scopeRevision, contentChecksum, content: valueEntry.content }
  }
  const snapshot = { campusId, revision, scopes: orderedScopes(scopes) }
  if (Object.keys(scopes).length !== scopeCount || scopedContentChecksum(snapshot) !== expectedChecksum) {
    throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'The stored checkpoint failed count or snapshot checksum validation.')
  }
  return snapshot
}

function assertStoredDocumentIdentity(head: HeadRow, campusId: string, canonicalDocumentId: string): void {
  if (head.campus_id !== campusId || head.document_id !== canonicalDocumentId) {
    throw new ScopedPostgresAdapterError('DOCUMENT_IDENTITY_MISMATCH', 'Stored campus/document identity differs from the trusted server identity.')
  }
}

/**
 * Server-only durable store proposal. This class is intentionally not imported
 * by `/api/graph`, the E2 dev endpoint, or any browser module.
 */
export class PostgresScopedCommitStore implements ScopedBatchCommitStore {
  private readonly statementTimeoutMs: number
  private readonly lockTimeoutMs: number
  private readonly checkpointInterval: number

  constructor(private readonly options: ScopedPostgresAdapterOptions) {
    this.statementTimeoutMs = options.statementTimeoutMs ?? 10_000
    this.lockTimeoutMs = options.lockTimeoutMs ?? 2_000
    this.checkpointInterval = options.checkpointInterval ?? 25
    if (!Number.isSafeInteger(this.statementTimeoutMs) || this.statementTimeoutMs < 100 || this.statementTimeoutMs > 60_000) {
      throw new Error('statementTimeoutMs must be a safe integer from 100 to 60000.')
    }
    if (!Number.isSafeInteger(this.lockTimeoutMs) || this.lockTimeoutMs < 50 || this.lockTimeoutMs > 30_000) {
      throw new Error('lockTimeoutMs must be a safe integer from 50 to 30000.')
    }
    if (!Number.isSafeInteger(this.checkpointInterval) || this.checkpointInterval < 1 || this.checkpointInterval > 10_000) {
      throw new Error('checkpointInterval must be a safe integer from 1 to 10000.')
    }
  }

  async readCampusState(campusId: string): Promise<ScopedCampusState> {
    const documentId = await this.authorize(campusId, 'read')
    return this.withTransaction(async (client) => {
      const headResult = await client.query<HeadRow>(SQL.readHead, [campusId])
      const head = headResult.rows[0]
      if (!head) throw new ScopedCommitError('CAMPUS_NOT_FOUND', `Campus not found: ${campusId}`)
      assertStoredDocumentIdentity(head, campusId, documentId)
      const scopeResult = await client.query<ScopeRow>(SQL.readScopes, [campusId])
      return stateFromHead(head, scopeRowsToMap(scopeResult.rows))
    }, true)
  }

  async findMutation(campusId: string, mutationId: string): Promise<ScopedCommitAcknowledgment | null> {
    const documentId = await this.authorize(campusId, 'read')
    if (typeof mutationId !== 'string' || mutationId.length === 0 || mutationId !== mutationId.trim()) {
      throw new ScopedCommitError('INVALID_CANDIDATE', 'A valid mutation id is required for receipt lookup.')
    }
    return this.withTransaction(async (client) => {
      const headResult = await client.query<HeadRow>(SQL.readHead, [campusId])
      const head = headResult.rows[0]
      if (!head) throw new ScopedCommitError('CAMPUS_NOT_FOUND', `Campus not found: ${campusId}`)
      assertStoredDocumentIdentity(head, campusId, documentId)
      const result = await client.query<ReceiptRow>(SQL.findReceipt, [campusId, mutationId])
      const row = result.rows[0]
      if (!row) return null
      return { ...receiptToAcknowledgment(row), campusId }
    }, true)
  }

  /** Create the initial revision-zero baseline from trusted server state only. */
  async initializeCampus(
    actorId: string,
    campusId: string,
    documentId: string,
    initialScopes: readonly ScopedPostgresSeedScope[],
  ): Promise<void> {
    const canonicalDocumentId = await this.authorize(campusId, 'write', actorId)
    if (canonicalDocumentId !== documentId) {
      throw new ScopedPostgresAdapterError('DOCUMENT_IDENTITY_MISMATCH', 'Bootstrap document identity does not match the trusted server identity.')
    }
    if (!Array.isArray(initialScopes) || initialScopes.length > 2000) {
      throw new Error('Bootstrap accepts between zero and 2000 scoped documents.')
    }
    const scopes: Record<string, ScopedPostgresStoredScope> = {}
    for (const entry of initialScopes) {
      validateScope(entry.scope)
      const key = scopeKey(entry.scope)
      if (scopes[key]) throw new Error(`Duplicate bootstrap scope: ${key}`)
      const content = cloneJson(entry.content)
      scopes[key] = {
        scope: cloneJson(entry.scope),
        revision: 0,
        contentChecksum: scopedContentChecksum(content),
        content,
      }
    }
    const snapshot = makeSnapshot(campusId, 0, scopes)
    const headChecksum = campusChecksum(campusId, 0, scopes)
    await this.withTransaction(async (client) => {
      await client.query(SQL.lockCampus, [campusId])
      const existing = await client.query<HeadRow>(SQL.lockHead, [campusId])
      if (existing.rows.length > 0) {
        throw new ScopedPostgresAdapterError('CAMPUS_ALREADY_INITIALIZED', 'A scoped campus baseline already exists; bootstrap never overwrites it.')
      }
      await client.query(SQL.insertCampus, [campusId, documentId, headChecksum, actorId])
      for (const scope of Object.values(scopes)) {
        await client.query(SQL.insertScope, [
          campusId,
          scope.scope.kind,
          scope.scope.id,
          scope.revision,
          scope.contentChecksum,
          JSON.stringify(scope.content),
        ])
      }
      await client.query(SQL.insertCheckpoint, [
        campusId,
        0,
        Object.keys(scopes).length,
        scopedContentChecksum(snapshot),
        JSON.stringify(snapshot),
      ])
    })
  }

  async commitAtomically(candidate: ScopedSaveCandidate, actorId: string): Promise<ScopedAtomicCommitResult> {
    const result = await this.commitBatchAtomically([candidate], actorId)
    if (result.status === 'conflict' || result.status === 'unchanged') return result
    const acknowledgment = result.acknowledgments[0]
    if (!acknowledgment) throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'Single-scope commit returned no receipt.')
    return { status: result.status, acknowledgment }
  }

  async commitBatchAtomically(
    candidates: readonly ScopedSaveCandidate[],
    actorId: string,
  ): Promise<ScopedBatchAtomicCommitResult> {
    const { campusId, expectedRevision, mutationIds, batchChecksum } = this.validateBatch(candidates)
    const documentId = await this.authorize(campusId, 'write', actorId)

    return this.withTransaction(async (client) => {
      await client.query(SQL.lockCampus, [campusId])
      const headResult = await client.query<HeadRow>(SQL.lockHead, [campusId])
      const head = headResult.rows[0]
      if (!head) return { status: 'conflict', code: 'CAMPUS_NOT_FOUND' }
      assertStoredDocumentIdentity(head, campusId, documentId)

      // Receipt lookup precedes stale-base rejection so a lost-ack retry can replay.
      const receiptResult = await client.query<ReceiptRow>(SQL.readReceipts, [campusId, mutationIds])
      if (receiptResult.rows.length > 0) {
        if (receiptResult.rows.length !== candidates.length) {
          throw new ScopedPostgresAdapterError('BATCH_REPLAY_INTEGRITY_FAILURE', 'Only part of the atomic batch has stored receipts.')
        }
        const byMutation = new Map(receiptResult.rows.map((row) => [row.mutation_id, row]))
        const acknowledgments = candidates.map((candidate) => {
          const receipt = byMutation.get(candidate.mutationId)
          if (!receipt || receipt.request_checksum !== candidate.requestChecksum || receipt.content_checksum !== candidate.contentChecksum) {
            throw new ScopedCommitError('MUTATION_ID_REUSED', 'A mutation id is already bound to a different request checksum.')
          }
          const acknowledgment = { ...receiptToAcknowledgment(receipt), campusId }
          if (acknowledgment.revision !== candidate.expectedCampusRevision + 1) {
            throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'A replay receipt has an unexpected revision.')
          }
          return acknowledgment
        })
        if (receiptResult.rows.some((row) => row.batch_checksum !== batchChecksum)) {
          throw new ScopedPostgresAdapterError('BATCH_REPLAY_INTEGRITY_FAILURE', 'Stored receipts do not belong to this exact canonical batch.')
        }
        const revision = acknowledgments[0].revision
        if (acknowledgments.some((acknowledgment) => acknowledgment.revision !== revision)) {
          throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'Stored batch receipts do not share one revision.')
        }
        return { status: 'replayed', acknowledgments }
      }

      const currentRevision = toSafeRevision(head.revision)
      if (currentRevision !== expectedRevision) {
        return { status: 'conflict', code: 'STALE_REVISION', currentRevision }
      }
      if (currentRevision >= Number.MAX_SAFE_INTEGER) {
        throw new ScopedPostgresAdapterError('REVISION_EXHAUSTED', 'The campus revision cannot be advanced without losing integer precision.')
      }

      const scopeResult = await client.query<ScopeRow>(SQL.readScopes, [campusId])
      const currentScopes = scopeRowsToMap(scopeResult.rows)
      for (const candidate of candidates) {
        for (const dependency of candidate.dependencies) {
          const dependencyKey = scopeKey(dependency.scope)
          const current = currentScopes[dependencyKey]
          if (!current) {
            if (dependency.required) return { status: 'conflict', code: 'DEPENDENCY_MISSING', currentRevision }
            continue
          }
          if (current.revision !== dependency.revision || current.contentChecksum !== dependency.contentChecksum) {
            return { status: 'conflict', code: 'DEPENDENCY_CONFLICT', currentRevision }
          }
        }
      }

      const changed = candidates.filter((candidate) => {
        return currentScopes[scopeKey(candidate.scope)]?.contentChecksum !== candidate.contentChecksum
      })
      if (changed.length === 0) return { status: 'unchanged', revision: currentRevision }

      const revision = currentRevision + 1
      const nextScopes = cloneJson(currentScopes)
      for (const candidate of changed) {
        nextScopes[scopeKey(candidate.scope)] = {
          scope: cloneJson(candidate.scope),
          revision,
          contentChecksum: candidate.contentChecksum,
          content: cloneJson(candidate.content),
        }
      }
      const beforeHeadChecksum = head.head_checksum
      const afterHeadChecksum = campusChecksum(campusId, revision, nextScopes)
      const setResult = await client.query<{ committed_at: string | Date }>(SQL.insertChangeSet, [
        campusId,
        revision,
        batchChecksum,
        beforeHeadChecksum,
        afterHeadChecksum,
        changed.length,
        actorId,
      ])
      const committedAtValue = setResult.rows[0]?.committed_at
      if (!committedAtValue) {
        throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'The database did not return the durable change-set timestamp.')
      }
      const committedAt = asIsoString(committedAtValue)

      const operationIndexes = new Map<string, number>()
      for (const [operationIndex, candidate] of changed.entries()) {
        operationIndexes.set(candidate.mutationId, operationIndex)
        await client.query(SQL.upsertScope, [
          campusId,
          candidate.scope.kind,
          candidate.scope.id,
          revision,
          candidate.contentChecksum,
          JSON.stringify(candidate.content),
        ])
        const previousChecksum = currentScopes[scopeKey(candidate.scope)]?.contentChecksum ?? MISSING_SCOPE_CHECKSUM
        await client.query(SQL.insertOperation, [
          campusId,
          revision,
          operationIndex,
          candidate.mutationId,
          candidate.scope.kind,
          candidate.scope.id,
          previousChecksum,
          candidate.contentChecksum,
          JSON.stringify(candidate.content),
        ])
        for (const [dependencyIndex, dependency] of candidate.dependencies.entries()) {
          await client.query(SQL.insertDependency, [
            campusId,
            revision,
            operationIndex,
            dependencyIndex,
            dependency.scope.kind,
            dependency.scope.id,
            dependency.revision,
            dependency.contentChecksum,
            dependency.required,
          ])
        }
      }

      const acknowledgments: ScopedCommitAcknowledgment[] = []
      for (const candidate of candidates) {
        const acknowledgment: ScopedCommitAcknowledgment = {
          campusId,
          revision,
          mutationId: candidate.mutationId,
          requestChecksum: candidate.requestChecksum,
          contentChecksum: candidate.contentChecksum,
          batchChecksum,
          committedAt,
        }
        await client.query(SQL.insertReceipt, [
          campusId,
          candidate.mutationId,
          candidate.requestChecksum,
          candidate.contentChecksum,
          revision,
          operationIndexes.get(candidate.mutationId) ?? null,
          batchChecksum,
          committedAt,
        ])
        acknowledgments.push(acknowledgment)
      }

      await client.query(SQL.updateHead, [campusId, revision, afterHeadChecksum, committedAt])
      if (revision % this.checkpointInterval === 0) {
        const snapshot = makeSnapshot(campusId, revision, nextScopes)
        await client.query(SQL.insertCheckpoint, [
          campusId,
          revision,
          Object.keys(nextScopes).length,
          scopedContentChecksum(snapshot),
          JSON.stringify(snapshot),
        ])
      }
      return { status: 'committed', acknowledgments }
    })
  }

  async reconstructCampus(campusId: string, targetRevision: number): Promise<ScopedPostgresReconstructedCampus> {
    if (!Number.isSafeInteger(targetRevision) || targetRevision < 0) {
      throw new Error('targetRevision must be a non-negative safe integer.')
    }
    const documentId = await this.authorize(campusId, 'read')
    return this.withTransaction(async (client) => {
      const headResult = await client.query<HeadRow>(SQL.readHead, [campusId])
      const head = headResult.rows[0]
      if (!head) throw new ScopedCommitError('CAMPUS_NOT_FOUND', `Campus not found: ${campusId}`)
      assertStoredDocumentIdentity(head, campusId, documentId)
      const headRevision = toSafeRevision(head.revision)
      if (targetRevision > headRevision) throw new Error('targetRevision is newer than the current campus head.')
      const checkpointResult = await client.query<CheckpointRow>(SQL.readCheckpoint, [campusId, targetRevision])
      const checkpoint = checkpointResult.rows[0]
      if (!checkpoint) throw new ScopedPostgresAdapterError('CHECKPOINT_NOT_FOUND', 'No verified checkpoint exists at or before this revision.')
      const checkpointRevision = toSafeRevision(checkpoint.revision)
      const snapshot = checkpointSnapshot(
        parseJsonValue(checkpoint.snapshot_json),
        campusId,
        checkpointRevision,
        checkpoint.scope_count,
        checkpoint.snapshot_checksum,
      )
      const scopes = cloneJson(snapshot.scopes)
      let revision = checkpointRevision
      let checksum = campusChecksum(campusId, revision, scopes)

      const historyResult = await client.query<ReconstructionRow>(SQL.readHistory, [campusId, revision, targetRevision])
      let offset = 0
      while (offset < historyResult.rows.length) {
        const nextRevision = toSafeRevision(historyResult.rows[offset].revision)
        const first = historyResult.rows[offset]
        if (nextRevision !== revision + 1 || first.before_head_checksum !== checksum) {
          throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', `The history chain is broken before revision ${nextRevision}.`)
        }
        const currentRows: ReconstructionRow[] = []
        while (offset < historyResult.rows.length && toSafeRevision(historyResult.rows[offset].revision) === nextRevision) {
          currentRows.push(historyResult.rows[offset])
          offset += 1
        }
        if (
          currentRows.length !== first.operation_count ||
          currentRows.some((operation, index) =>
            !Number.isSafeInteger(operation.operation_index) ||
            operation.operation_index !== index ||
            operation.operation_count !== first.operation_count ||
            operation.before_head_checksum !== first.before_head_checksum ||
            operation.after_head_checksum !== first.after_head_checksum,
          )
        ) {
          throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', `Revision ${nextRevision} has an incomplete or inconsistent operation set.`)
        }
        for (const operation of currentRows) {
          const scope: ScopedSaveScope = { kind: operation.scope_kind, id: operation.scope_id }
          const key = scopeKey(scope)
          const previousChecksum = scopes[key]?.contentChecksum ?? MISSING_SCOPE_CHECKSUM
          const content = parseJsonValue(operation.content_json)
          if (previousChecksum !== operation.before_checksum || scopedContentChecksum(content) !== operation.after_checksum) {
            throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', `The operation for ${key} failed its before/after checksum.`)
          }
          scopes[key] = {
            scope,
            revision: nextRevision,
            contentChecksum: operation.after_checksum,
            content,
          }
        }
        revision = nextRevision
        checksum = campusChecksum(campusId, revision, scopes)
        if (checksum !== first.after_head_checksum) {
          throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', `Revision ${revision} failed its campus checksum.`)
        }
      }
      if (revision !== targetRevision) {
        throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', `History ended at revision ${revision}, not requested revision ${targetRevision}.`)
      }
      if (targetRevision === headRevision && checksum !== head.head_checksum) {
        throw new ScopedPostgresAdapterError('HISTORY_INTEGRITY_FAILURE', 'Reconstructed current state does not match the campus head.')
      }
      return { campusId, revision, checksum, scopes: orderedScopes(scopes) }
    }, true)
  }

  private validateBatch(candidates: readonly ScopedSaveCandidate[]) {
    if (candidates.length === 0 || candidates.length > 32) {
      throw new ScopedCommitError('INVALID_CANDIDATE', 'A scoped PostgreSQL batch must contain between 1 and 32 candidates.')
    }
    const campusId = candidates[0].campusId
    const expectedRevision = candidates[0].expectedCampusRevision
    const mutationIds = new Set<string>()
    const scopes = new Set<string>()
    for (const candidate of candidates) {
      validateCandidate(candidate)
      if (candidate.campusId !== campusId || candidate.expectedCampusRevision !== expectedRevision) {
        throw new ScopedCommitError('INVALID_CANDIDATE', 'Every candidate in a scoped batch must share campus and expected revision.')
      }
      const key = scopeKey(candidate.scope)
      if (mutationIds.has(candidate.mutationId) || scopes.has(key)) {
        throw new ScopedCommitError('INVALID_CANDIDATE', 'A scoped batch cannot repeat mutation ids or target scopes.')
      }
      mutationIds.add(candidate.mutationId)
      scopes.add(key)
    }
    return {
      campusId,
      expectedRevision,
      mutationIds: [...mutationIds],
      batchChecksum: scopedBatchChecksum(candidates),
    }
  }

  private async authorize(campusId: string, permission: 'read' | 'write', expectedActorId?: string): Promise<string> {
    const actorId = await this.options.resolveTrustedActor()
    if (typeof actorId !== 'string' || actorId.length === 0 || actorId !== actorId.trim() || (expectedActorId !== undefined && expectedActorId !== actorId)) {
      throw new ScopedPostgresAdapterError('AUTHORIZATION_DENIED', 'A trusted server actor identity is required.')
    }
    const documentId = await this.options.resolveDocumentId(campusId)
    assertAuthorizedIdentity(campusId, documentId)
    if (!(await this.options.authorizeActor({ actorId, campusId, documentId, permission }))) {
      throw new ScopedPostgresAdapterError('AUTHORIZATION_DENIED', `The trusted server identity is not authorized to ${permission} this campus.`)
    }
    return documentId
  }

  private async withTransaction<T>(work: (client: ScopedPgClient) => Promise<T>, readOnly = false): Promise<T> {
    const client = await this.options.pool.connect()
    let inTransaction = false
    let releaseError: Error | undefined
    try {
      await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN')
      inTransaction = true
      await client.query(SQL.setTimeouts, [`${this.statementTimeoutMs}ms`, `${this.lockTimeoutMs}ms`])
      const result = await work(client)
      try {
        await client.query('COMMIT')
      } catch (error) {
        inTransaction = false
        releaseError = error instanceof Error ? error : new Error('Commit acknowledgment failed.')
        throw new ScopedPostgresAdapterError('COMMIT_OUTCOME_UNKNOWN', 'The COMMIT acknowledgment was lost; retry the exact mutation to resolve its durable receipt.', error)
      }
      inTransaction = false
      return result
    } catch (error) {
      if (inTransaction) {
        try {
          await client.query('ROLLBACK')
        } catch (rollbackError) {
          throw new ScopedPostgresAdapterError('ROLLBACK_FAILURE', 'The PostgreSQL transaction failed and rollback also failed.', error, rollbackError)
        }
      }
      if (error instanceof ScopedPostgresAdapterError || error instanceof ScopedCommitError) throw error
      if (isSqlState(error, '55P03')) {
        throw new ScopedPostgresAdapterError('LOCK_TIMEOUT', 'The PostgreSQL campus lock timed out; retry after backoff.', error)
      }
      if (isSqlState(error, '57014')) {
        throw new ScopedPostgresAdapterError('STATEMENT_TIMEOUT', 'The PostgreSQL statement exceeded its configured timeout.', error)
      }
      if (isSqlState(error, '40P01') || isSqlState(error, '40001')) {
        throw new ScopedPostgresAdapterError('RETRYABLE_TRANSACTION_FAILURE', 'The PostgreSQL transaction was rolled back after a deadlock or serialization conflict.', error)
      }
      if (isSqlState(error, '23505')) {
        throw new ScopedPostgresAdapterError('DATABASE_FAILURE', 'A unique database constraint rejected the scoped transaction.', error)
      }
      throw new ScopedPostgresAdapterError('DATABASE_FAILURE', 'The PostgreSQL scoped transaction failed and was rolled back.', error)
    } finally {
      client.release(releaseError)
    }
  }
}

export const scopedPostgresSqlForTests = SQL
export const scopedPostgresMissingScopeChecksumForTests = MISSING_SCOPE_CHECKSUM
