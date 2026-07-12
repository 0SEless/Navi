import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PublishService } from '../publish-service'
import { PublishStore } from '../publish-store'
import type { EditorServiceContext } from '../../context/service-registry'

function createMockContext(overrides?: {
  isSaving?: boolean
  hasUnsavedChanges?: boolean
  lastValidatedRevision?: number
  documentVersion?: number
  hasErrors?: boolean
  compileResult?: any
  publishResult?: any
}): { context: EditorServiceContext } {
  const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
  const documentVersion = overrides?.documentVersion ?? 1
  const documentStore = { version: documentVersion, document: { metadata: { name: 'test-campus' } } }

  const workflowService = {
    isSaving: vi.fn().mockReturnValue(overrides?.isSaving ?? false),
    hasUnsavedChanges: vi.fn().mockReturnValue(overrides?.hasUnsavedChanges ?? false),
  }

  const validationService = {
    getSnapshot: vi.fn().mockReturnValue({
      lastValidatedRevision: overrides?.lastValidatedRevision ?? documentVersion,
      summary: { errors: 0 },
    }),
    hasErrors: vi.fn().mockReturnValue(overrides?.hasErrors ?? false),
    validateNow: vi.fn().mockResolvedValue(undefined),
  }

  const navCompiler = {
    compile: vi.fn().mockResolvedValue(
      overrides?.compileResult ?? { status: 'success', timestamp: Date.now(), artifacts: { navigationGraph: { version: '1.0.0', nodes: [], edges: [] }, searchIndex: null, poiData: null, buildingIndex: null } }
    ),
  }

  const persistence = {
    publish: vi.fn().mockResolvedValue(overrides?.publishResult ?? { success: true }),
  }

  const context = {
    get: (id: string) => {
      const map: Record<string, any> = {
        workflow: workflowService,
        validationService,
        navigationCompiler: navCompiler,
        persistence,
        documentStore,
        eventBus,
      }
      return map[id]
    },
    document: documentStore.document,
  } as unknown as EditorServiceContext

  return { context }
}

describe('PublishService', () => {
  let store: PublishStore
  let service: PublishService

  beforeEach(() => {
    store = new PublishStore()
    service = new PublishService(store)
  })

  afterEach(async () => {
    if (service.status !== 'uninitialized') {
      await service.destroy()
    }
  })

  it('initial snapshot is idle', () => {
    const snap = service.getSnapshot()
    expect(snap.publishState).toBe('idle')
    expect(snap.publishResult).toBeNull()
    expect(snap.publishError).toBeNull()
  })

  it('isPublishing returns false when idle', () => {
    expect(service.isPublishing()).toBe(false)
  })

  it('rejects publish when document has unsaved changes', async () => {
    const { context } = createMockContext({ hasUnsavedChanges: true })
    await service.init(context)
    await expect(service.publish()).rejects.toThrow('Document has unsaved changes')
  })

  it('rejects publish when validation has errors', async () => {
    const { context } = createMockContext({ hasErrors: true })
    await service.init(context)
    await expect(service.publish()).rejects.toThrow('Validation has errors')
  })

  it('rejects publish when save in progress', async () => {
    const { context } = createMockContext({ isSaving: true })
    await service.init(context)
    await expect(service.publish()).rejects.toThrow('Save in progress')
  })

  it('runs validation if revision is stale', async () => {
    const { context } = createMockContext({ lastValidatedRevision: 0, documentVersion: 5 })
    await service.init(context)
    await service.publish()
    expect(service.getSnapshot().publishState).toBe('success')
  })

  it('skips validation if cached revision matches', async () => {
    const { context } = createMockContext({ lastValidatedRevision: 1, documentVersion: 1 })
    await service.init(context)
    await service.publish()
    expect(service.getSnapshot().publishState).toBe('success')
  })

  it('sets error state on compile failure', async () => {
    const { context } = createMockContext({ compileResult: { status: 'error', message: 'Graph has cycles', timestamp: Date.now() } })
    await service.init(context)
    await service.publish()
    const snap = service.getSnapshot()
    expect(snap.publishState).toBe('error')
    expect(snap.publishError).toContain('Graph has cycles')
  })

  it('sets error state on publish failure', async () => {
    const { context } = createMockContext({ publishResult: { success: false, message: 'Upload rejected' } })
    await service.init(context)
    await service.publish()
    const snap = service.getSnapshot()
    expect(snap.publishState).toBe('error')
    expect(snap.publishError).toContain('Upload rejected')
  })

  it('concurrent publish calls share the same in-flight promise', async () => {
    const { context } = createMockContext()
    await service.init(context)

    const p1 = service.publish()
    const p2 = service.publish()
    expect(p1).toBe(p2)
    await p1
    expect(service.getSnapshot().publishState).toBe('success')
  })

  it('transitions through all expected states on success', async () => {
    const { context } = createMockContext()
    await service.init(context)

    const states: string[] = []
    const unsub = store.subscribe(() => {
      states.push(store.getSnapshot().publishState)
    })

    await service.publish()
    unsub()

    expect(states).toContain('preparing')
    expect(states).toContain('validating')
    expect(states).toContain('compiling')
    expect(states).toContain('uploading')
    expect(states).toContain('success')
  })
})