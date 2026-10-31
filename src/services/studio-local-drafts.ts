import {
  AUTHORED_DOCUMENT_FORMAT_VERSION,
  toAuthoredDocumentSnapshot,
  type CampusDocument,
} from '@navi/core'
import type { GraphSnapshot } from '@/types/nav-types'

export const STUDIO_DRAFT_DB_NAME = 'navi-studio-local-drafts'
export const STUDIO_DRAFT_OBJECT_STORE = 'campus-drafts'
export const STUDIO_DRAFT_SCHEMA_VERSION = 1

export interface StudioDraftScope {
  buildingId: string | null
  floor: number | null
}

export interface StudioDraftRecord {
  draftId: string
  campusId: string
  documentId: string
  schemaVersion: number
  authoredDocumentFormatVersion: typeof AUTHORED_DOCUMENT_FORMAT_VERSION
  scope: StudioDraftScope
  baseServerRevision: string | null
  createdAt: string
  updatedAt: string
  graph: GraphSnapshot
  authoredDocument: CampusDocument
  checksum: string
}

export interface StudioDraftRepository {
  get(campusId: string): Promise<StudioDraftRecord | null>
  put(record: StudioDraftRecord): Promise<void>
  delete(campusId: string): Promise<void>
}

export interface CreateStudioDraftInput {
  campusId: string
  graph: GraphSnapshot
  authoredDocument: CampusDocument
  scope?: Partial<StudioDraftScope>
  baseServerRevision?: string | null
  createdAt?: string
  now?: () => string
}

type DraftBody = Omit<StudioDraftRecord, 'checksum'>

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  const source = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(source).sort()) {
    if (source[key] !== undefined) result[key] = canonicalize(source[key])
  }
  return result
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

async function sha256(value: unknown): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('Web Crypto SHA-256 is unavailable; local draft was not stored.')
  const bytes = new TextEncoder().encode(canonicalJson(value))
  const digest = await subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createStudioDraftRecord(input: CreateStudioDraftInput): Promise<StudioDraftRecord> {
  const campusId = input.campusId.trim()
  if (!campusId) throw new Error('A campus id is required for local draft storage.')
  if (input.authoredDocument.metadata?.campusId !== campusId) {
    throw new Error('The authored document campus id does not match the active campus; draft was not stored.')
  }

  const authoredDocument = toAuthoredDocumentSnapshot(input.authoredDocument)
  const graph = cloneJson(input.graph)
  const timestamp = (input.now ?? (() => new Date().toISOString()))()
  const body: DraftBody = {
    draftId: `studio-draft:${campusId}`,
    campusId,
    documentId: `campus:${campusId}`,
    schemaVersion: STUDIO_DRAFT_SCHEMA_VERSION,
    authoredDocumentFormatVersion: AUTHORED_DOCUMENT_FORMAT_VERSION,
    scope: {
      buildingId: input.scope?.buildingId ?? null,
      floor: typeof input.scope?.floor === 'number' ? input.scope.floor : null,
    },
    baseServerRevision: input.baseServerRevision ?? null,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: timestamp,
    graph,
    authoredDocument,
  }

  return { ...body, checksum: await sha256(body) }
}

export async function verifyStudioDraftRecord(
  value: unknown,
  expectedCampusId: string,
): Promise<StudioDraftRecord> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Local draft is invalid; the stored record was preserved.')
  }
  const record = value as Partial<StudioDraftRecord>
  if (record.schemaVersion !== STUDIO_DRAFT_SCHEMA_VERSION) {
    throw new Error(`Unsupported local draft schema version: ${String(record.schemaVersion)}. The record was preserved.`)
  }
  if (
    record.campusId !== expectedCampusId ||
    record.documentId !== `campus:${expectedCampusId}` ||
    record.draftId !== `studio-draft:${expectedCampusId}`
  ) {
    throw new Error('Local draft identity does not match the active campus; the record was preserved.')
  }
  if (record.authoredDocumentFormatVersion !== AUTHORED_DOCUMENT_FORMAT_VERSION) {
    throw new Error('Unsupported authored document format in local draft; the record was preserved.')
  }
  if (!record.graph || !record.authoredDocument || record.authoredDocument.metadata?.campusId !== expectedCampusId) {
    throw new Error('Local draft content does not match its campus identity; the record was preserved.')
  }
  const { checksum, ...body } = record as StudioDraftRecord
  if (typeof checksum !== 'string' || !/^[a-f0-9]{64}$/.test(checksum) || await sha256(body) !== checksum) {
    throw new Error('Local draft checksum is invalid; the record was preserved.')
  }
  return cloneJson(record as StudioDraftRecord)
}

/** Fingerprint authored content/scope/base revision without save timestamps. */
export function studioDraftContentFingerprint(record: StudioDraftRecord): Promise<string> {
  const content = { ...record } as Omit<StudioDraftRecord, 'checksum'> & { checksum?: string }
  delete content.checksum
  delete content.createdAt
  delete content.updatedAt
  const graph = { ...content.graph } as GraphSnapshot & { updatedAt?: string }
  delete graph.updatedAt
  content.graph = graph
  return sha256(content)
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was interrupted'))
  })
}

async function awaitRequestAndTransaction<T>(request: IDBRequest<T>, transaction: IDBTransaction): Promise<T> {
  const completed = transactionResult(transaction)
  try {
    const result = await requestResult(request)
    await completed
    return result
  } catch (error) {
    // A failed request usually aborts its transaction. Observe that rejection
    // before propagating the request error so storage failures stay handled.
    await completed.catch(() => undefined)
    throw error
  }
}

export function openStudioDraftDatabase(
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
): Promise<IDBDatabase> {
  if (!factory) return Promise.reject(new Error('IndexedDB is unavailable; local draft cannot be stored.'))
  return new Promise((resolve, reject) => {
    const request = factory.open(STUDIO_DRAFT_DB_NAME, STUDIO_DRAFT_SCHEMA_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STUDIO_DRAFT_OBJECT_STORE)) {
        database.createObjectStore(STUDIO_DRAFT_OBJECT_STORE, { keyPath: 'campusId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open Studio draft IndexedDB.'))
    request.onblocked = () => reject(new Error('Studio draft IndexedDB upgrade is blocked.'))
  })
}

const queuedWrites = new Map<string, Promise<void>>()

export function createIndexedDbStudioDraftRepository(
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
): StudioDraftRepository {
  return {
    async get(campusId) {
      const database = await openStudioDraftDatabase(factory)
      try {
        const transaction = database.transaction(STUDIO_DRAFT_OBJECT_STORE, 'readonly')
        const value = await awaitRequestAndTransaction(
          transaction.objectStore(STUDIO_DRAFT_OBJECT_STORE).get(campusId),
          transaction,
        )
        return value ? cloneJson(value as StudioDraftRecord) : null
      } finally {
        database.close()
      }
    },
    async put(record) {
      const previous = queuedWrites.get(record.campusId) ?? Promise.resolve()
      const next = previous.catch(() => undefined).then(async () => {
        const database = await openStudioDraftDatabase(factory)
        try {
          const transaction = database.transaction(STUDIO_DRAFT_OBJECT_STORE, 'readwrite')
          await awaitRequestAndTransaction(
            transaction.objectStore(STUDIO_DRAFT_OBJECT_STORE).put(cloneJson(record)),
            transaction,
          )
        } finally {
          database.close()
        }
      })
      queuedWrites.set(record.campusId, next)
      try {
        await next
      } catch (error) {
        throw new Error(`IndexedDB draft write failed: ${error instanceof Error ? error.message : 'unknown storage error'}`)
      } finally {
        if (queuedWrites.get(record.campusId) === next) queuedWrites.delete(record.campusId)
      }
    },
    async delete(campusId) {
      const database = await openStudioDraftDatabase(factory)
      try {
        const transaction = database.transaction(STUDIO_DRAFT_OBJECT_STORE, 'readwrite')
        await awaitRequestAndTransaction(
          transaction.objectStore(STUDIO_DRAFT_OBJECT_STORE).delete(campusId),
          transaction,
        )
      } finally {
        database.close()
      }
    },
  }
}

export const studioDraftRepository = createIndexedDbStudioDraftRepository()
