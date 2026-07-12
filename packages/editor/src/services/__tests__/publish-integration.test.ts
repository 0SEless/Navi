import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PublishStore } from '../publish-store'
import { PublishService } from '../publish-service'
import type { EditorServiceContext } from '../../context/service-registry'

describe('Publish integration', () => {
  let store: PublishStore
  let service: PublishService

  beforeEach(() => {
    store = new PublishStore()
    service = new PublishService(store)
  })

  afterEach(async () => {
    await service.destroy()
  })

  it('full publish pipeline succeeds end-to-end', async () => {
    const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
    const documentStore = { version: 1, document: { metadata: { name: 'integration-test' } } }

    const context = {
      get: (id: string) => {
        const map: Record<string, any> = {
          workflow: {
            isSaving: vi.fn().mockReturnValue(false),
            hasUnsavedChanges: vi.fn().mockReturnValue(false),
          },
          validationService: {
            getSnapshot: vi.fn().mockReturnValue({ lastValidatedRevision: 1, summary: { errors: 0 } }),
            hasErrors: vi.fn().mockReturnValue(false),
            validateNow: vi.fn().mockResolvedValue(undefined),
          },
          navigationCompiler: {
            compile: vi.fn().mockResolvedValue({
              status: 'success',
              timestamp: Date.now(),
              artifacts: {
                navigationGraph: { version: '2.0.0', nodes: [{ id: 'n1' }, { id: 'n2' }], edges: [{ id: 'e1' }] },
                searchIndex: { entries: [] },
                poiData: { points: [] },
                buildingIndex: { buildings: [] },
              },
            }),
          },
          persistence: {
            publish: vi.fn().mockResolvedValue({ success: true }),
          },
          documentStore,
          eventBus,
        }
        return map[id]
      },
      document: documentStore.document,
    } as unknown as EditorServiceContext

    await service.init(context)
    expect(store.getSnapshot().publishState).toBe('idle')

    await service.publish()
    const snap = store.getSnapshot()
    expect(snap.publishState).toBe('success')
    expect(snap.publishResult).not.toBeNull()
    expect(snap.publishResult!.revision).toBe(1)
    expect(snap.publishResult!.compiledGraphVersion).toBe('2.0.0')
    expect(snap.publishResult!.nodeCount).toBe(2)
    expect(snap.publishResult!.edgeCount).toBe(1)
    expect(snap.publishResult!.artifactCount).toBe(4)
    expect(snap.publishResult!.startedAt).toBeGreaterThan(0)
    expect(snap.publishResult!.finishedAt).toBeGreaterThan(0)
    expect(snap.publishResult!.campusId).toBe('integration-test')
  })

  it('can publish again after success', async () => {
    const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
    const documentStore = { version: 2, document: { metadata: { name: 'test' } } }

    const compileMock = vi.fn().mockResolvedValue({
      status: 'success',
      timestamp: Date.now(),
      artifacts: {
        navigationGraph: { version: '1.0.0', nodes: [], edges: [] },
        searchIndex: null, poiData: null, buildingIndex: null,
      },
    })
    const publishMock = vi.fn().mockResolvedValue({ success: true })

    const context = {
      get: (id: string) => {
        const map: Record<string, any> = {
          workflow: {
            isSaving: vi.fn().mockReturnValue(false),
            hasUnsavedChanges: vi.fn().mockReturnValue(false),
          },
          validationService: {
            getSnapshot: vi.fn().mockReturnValue({ lastValidatedRevision: 2, summary: { errors: 0 } }),
            hasErrors: vi.fn().mockReturnValue(false),
            validateNow: vi.fn().mockResolvedValue(undefined),
          },
          navigationCompiler: { compile: compileMock },
          persistence: { publish: publishMock },
          documentStore,
          eventBus,
        }
        return map[id]
      },
      document: documentStore.document,
    } as unknown as EditorServiceContext

    await service.init(context)

    await service.publish()
    expect(store.getSnapshot().publishState).toBe('success')
    expect(compileMock).toHaveBeenCalledTimes(1)
    expect(publishMock).toHaveBeenCalledTimes(1)

    compileMock.mockClear()
    publishMock.mockClear()

    documentStore.version = 3
    await service.publish()
    expect(store.getSnapshot().publishState).toBe('success')
    expect(compileMock).toHaveBeenCalledTimes(1)
    expect(publishMock).toHaveBeenCalledTimes(1)
  })

  it('validation caching skips re-validation when revision matches', async () => {
    const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
    const documentStore = { version: 1, document: { metadata: { name: 'test' } } }
    const validateNow = vi.fn().mockResolvedValue(undefined)

    const context = {
      get: (id: string) => {
        const map: Record<string, any> = {
          workflow: {
            isSaving: vi.fn().mockReturnValue(false),
            hasUnsavedChanges: vi.fn().mockReturnValue(false),
          },
          validationService: {
            getSnapshot: vi.fn().mockReturnValue({ lastValidatedRevision: 1, summary: { errors: 0 } }),
            hasErrors: vi.fn().mockReturnValue(false),
            validateNow,
          },
          navigationCompiler: {
            compile: vi.fn().mockResolvedValue({
              status: 'success',
              timestamp: Date.now(),
              artifacts: {
                navigationGraph: { version: '1.0.0', nodes: [], edges: [] },
                searchIndex: null, poiData: null, buildingIndex: null,
              },
            }),
          },
          persistence: {
            publish: vi.fn().mockResolvedValue({ success: true }),
          },
          documentStore,
          eventBus,
        }
        return map[id]
      },
      document: documentStore.document,
    } as unknown as EditorServiceContext

    await service.init(context)
    await service.publish()
    expect(validateNow).not.toHaveBeenCalled()
  })
})
