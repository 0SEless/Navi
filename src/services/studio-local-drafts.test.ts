import { describe, expect, it, vi } from 'vitest'
import type { CampusDocument } from '@navi/core'
import type { GraphSnapshot } from '@/types/nav-types'
import {
  createIndexedDbStudioDraftRepository,
  createStudioDraftRecord,
  STUDIO_DRAFT_SCHEMA_VERSION,
  verifyStudioDraftRecord,
  type StudioDraftRecord,
} from './studio-local-drafts'

function fakeIndexedDb() {
  const records = new Map<string, StudioDraftRecord>()
  let failNextWrite = false
  const factory = {
    open: () => {
      const request: Record<string, unknown> = {}
      queueMicrotask(() => {
        const objectStoreNames = { contains: () => true }
        const database = {
          objectStoreNames,
          createObjectStore: vi.fn(),
          close: vi.fn(),
          transaction: (_store: string, mode: IDBTransactionMode) => {
            const transaction: Record<string, unknown> = {}
            const finish = () => queueMicrotask(() => (transaction.oncomplete as (() => void) | undefined)?.())
            transaction.objectStore = () => ({
              get: (key: string) => {
                const getRequest: Record<string, unknown> = {}
                queueMicrotask(() => {
                  getRequest.result = records.get(key)
                  ;(getRequest.onsuccess as (() => void) | undefined)?.()
                  finish()
                })
                return getRequest
              },
              put: (record: StudioDraftRecord) => {
                const putRequest: Record<string, unknown> = {}
                queueMicrotask(() => {
                  if (failNextWrite) {
                    failNextWrite = false
                    putRequest.error = new Error('QuotaExceededError')
                    ;(putRequest.onerror as (() => void) | undefined)?.()
                    ;(transaction.onerror as (() => void) | undefined)?.()
                    ;(transaction.onabort as (() => void) | undefined)?.()
                    return
                  }
                  records.set(record.campusId, structuredClone(record))
                  putRequest.result = record.campusId
                  ;(putRequest.onsuccess as (() => void) | undefined)?.()
                  finish()
                })
                return putRequest
              },
              delete: (key: string) => {
                const deleteRequest: Record<string, unknown> = {}
                queueMicrotask(() => {
                  records.delete(key)
                  ;(deleteRequest.onsuccess as (() => void) | undefined)?.()
                  finish()
                })
                return deleteRequest
              },
            })
            if (mode === 'readwrite') {
              transaction.abort = () => (transaction.onabort as (() => void) | undefined)?.()
            }
            return transaction
          },
        }
        request.result = database
        ;(request.onupgradeneeded as (() => void) | undefined)?.()
        ;(request.onsuccess as (() => void) | undefined)?.()
      })
      return request
    },
  }
  return {
    factory: factory as unknown as IDBFactory,
    records,
    failWrite: () => { failNextWrite = true },
  }
}

function document(campusId: string): CampusDocument {
  return {
    schemaVersion: 1,
    version: 3,
    metadata: { campusId, name: `Campus ${campusId}`, lastModified: '', editorVersion: 'test' },
    buildings: [],
    roads: [],
    panoramas: [],
    qrCheckpoints: [],
  }
}

const graph = (campusId: string): GraphSnapshot => ({
  campusId,
  nodes: [],
  edges: [],
  buildings: [],
  components: [],
  traces: [],
  updatedAt: 'volatile-time',
} as unknown as GraphSnapshot)

describe('Studio IndexedDB local drafts', () => {
  it('creates a stable, versioned campus record with scope and base revision', async () => {
    const first = await createStudioDraftRecord({
      campusId: 'campus-a', graph: graph('campus-a'), authoredDocument: document('campus-a'),
      scope: { buildingId: 'building-1', floor: 2 }, baseServerRevision: 'rev-12', now: () => '2026-10-27T00:00:00.000Z',
    })
    const second = await createStudioDraftRecord({
      campusId: 'campus-a', graph: graph('campus-a'), authoredDocument: document('campus-a'),
      scope: { buildingId: 'building-1', floor: 2 }, baseServerRevision: 'rev-12', now: () => '2026-10-27T00:00:00.000Z',
    })

    expect(first).toMatchObject({
      campusId: 'campus-a', documentId: 'campus:campus-a', draftId: 'studio-draft:campus-a',
      schemaVersion: STUDIO_DRAFT_SCHEMA_VERSION, scope: { buildingId: 'building-1', floor: 2 },
      baseServerRevision: 'rev-12', updatedAt: '2026-10-27T00:00:00.000Z',
    })
    expect(first.checksum).toMatch(/^[a-f0-9]{64}$/)
    expect(first.checksum).toBe(second.checksum)
  })

  it('ignores volatile graph and save timestamps when checking for unchanged content', async () => {
    const { studioDraftContentFingerprint } = await import('./studio-local-drafts')
    const first = await createStudioDraftRecord({
      campusId: 'campus-a', graph: { ...graph('campus-a'), updatedAt: 'time-1' },
      authoredDocument: document('campus-a'), now: () => 'time-1',
    })
    const second = await createStudioDraftRecord({
      campusId: 'campus-a', graph: { ...graph('campus-a'), updatedAt: 'time-2' },
      authoredDocument: document('campus-a'), now: () => 'time-2',
    })

    await expect(studioDraftContentFingerprint(first)).resolves.toBe(await studioDraftContentFingerprint(second))
  })

  it('round-trips IndexedDB records and isolates records by campus', async () => {
    const db = fakeIndexedDb()
    const repository = createIndexedDbStudioDraftRepository(db.factory)
    const first = await createStudioDraftRecord({ campusId: 'campus-a', graph: graph('campus-a'), authoredDocument: document('campus-a') })
    const second = await createStudioDraftRecord({ campusId: 'campus-b', graph: graph('campus-b'), authoredDocument: document('campus-b') })

    await repository.put(first)
    await repository.put(second)
    expect(await repository.get('campus-a')).toEqual(first)
    expect(await repository.get('campus-b')).toEqual(second)
    await repository.delete('campus-a')
    expect(await repository.get('campus-a')).toBeNull()
    expect(await repository.get('campus-b')).toEqual(second)
  })

  it('rejects a corrupt checksum and unsupported schema without deleting either record', async () => {
    const db = fakeIndexedDb()
    const repository = createIndexedDbStudioDraftRepository(db.factory)
    const record = await createStudioDraftRecord({ campusId: 'campus-a', graph: graph('campus-a'), authoredDocument: document('campus-a') })
    const tamperedDocument = document('campus-a')
    tamperedDocument.metadata.name = 'Tampered after save'
    const corrupt = { ...record, authoredDocument: tamperedDocument } as StudioDraftRecord
    const unsupported = { ...record, schemaVersion: STUDIO_DRAFT_SCHEMA_VERSION + 1 } as StudioDraftRecord

    await repository.put(corrupt)
    await expect(verifyStudioDraftRecord(corrupt, 'campus-a')).rejects.toThrow(/checksum/i)
    expect(await repository.get('campus-a')).toEqual(corrupt)

    await repository.put(unsupported)
    await expect(verifyStudioDraftRecord(unsupported, 'campus-a')).rejects.toThrow(/schema/i)
    expect(await repository.get('campus-a')).toEqual(unsupported)
  })

  it('does not claim a draft was saved when IndexedDB fails a write', async () => {
    const db = fakeIndexedDb()
    const repository = createIndexedDbStudioDraftRepository(db.factory)
    const record = await createStudioDraftRecord({ campusId: 'campus-a', graph: graph('campus-a'), authoredDocument: document('campus-a') })
    db.failWrite()

    await expect(repository.put(record)).rejects.toThrow(/quota|indexeddb/i)
    expect(db.records.has('campus-a')).toBe(false)
  })
})
