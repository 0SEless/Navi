import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NavigationCompiler } from '../navigation-compiler'
import { PersistenceService } from '../persistence-service'
import { WorkflowStore } from '../workflow-store'
import { WorkflowService } from '../workflow-service'
import type { CompilerAdapter } from '../navigation-compiler'
import type { PersistenceAdapter } from '../persistence-service'
import type { EditorServiceContext } from '../../context/service-registry'
import { DocumentEventBus } from '../../eventbus'

describe('WorkflowService', () => {
  let service: WorkflowService
  let workflowStore: WorkflowStore
  let documentStore: { version: number; document: any }
  let context: EditorServiceContext

  function buildContext(options?: { compileSuccess?: boolean }): EditorServiceContext {
    const eventBus = new DocumentEventBus()

    const compileAdapter: CompilerAdapter = {
      compile: vi.fn().mockResolvedValue(
        options?.compileSuccess === false
          ? { status: 'error', message: 'Compile error', timestamp: 0 }
          : { status: 'success', timestamp: 0, artifacts: { navigationGraph: { nodes: [] }, searchIndex: null, poiData: null, buildingIndex: null } }
      ),
    }

    const persistAdapter: PersistenceAdapter = {
      save: vi.fn().mockResolvedValue(undefined),
      syncToSupabase: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue({ success: true, version: '1.0.0' }),
    }

    documentStore = { version: 0, document: { metadata: { name: 'test' } } }
    workflowStore = new WorkflowStore()

    const navCompiler = new NavigationCompiler(compileAdapter)
    const persistence = new PersistenceService(persistAdapter)
    service = new WorkflowService()

    // Register all services
    const store = new Map<string, any>()
    store.set('navigationCompiler', navCompiler)
    store.set('persistence', persistence)
    store.set('validation', { validateAll: () => [] })
    store.set('documentStore', documentStore)
    store.set('workflowStore', workflowStore)
    store.set('eventBus', eventBus)

    // Build a minimal context for dependency init
    const ctx = {
      get: (id: string) => store.get(id),
      document: documentStore.document,
    } as unknown as EditorServiceContext

    // Initialize dependent services so they have valid status transitions
    // (PersistenceService.transitionTo('busy') requires 'ready' status)
    navCompiler.init(ctx)
    persistence.init(ctx)

    return ctx
  }

  beforeEach(async () => {
    context = buildContext()
    await service.init(context)
  })

  describe('isDirty', () => {
    it('returns false when version matches lastSaveVersion', () => {
      documentStore.version = 5
      workflowStore.setLastSaveVersion(5)
      expect(service.isDirty()).toBe(false)
    })

    it('returns true when version > lastSaveVersion', () => {
      documentStore.version = 10
      workflowStore.setLastSaveVersion(5)
      expect(service.isDirty()).toBe(true)
    })
  })

  describe('validate', () => {
    it('writes validation result to WorkflowStore', async () => {
      await service.validate()
      expect(workflowStore.getSnapshot().lastValidation).not.toBeNull()
    })

    it('validation result with errors', async () => {
      const ctx = buildContext()
      // Store the original get to preserve other lookups
      const originalGet = ctx.get.bind(ctx)
      ctx.get = (id: string) => {
        if (id === 'validation') return {
          validateAll: () => [
            { severity: 'error', message: 'Missing name', validatorId: 'test' },
          ],
        }
        return originalGet(id)
      }
      await service.init(ctx as EditorServiceContext)
      const result = await service.validate()
      expect(result.failed).toBe(1)
      expect(result.errors).toContain('Missing name')
    })
  })

  describe('compile', () => {
    it('writes compile result to WorkflowStore', async () => {
      await service.compile()
      expect(workflowStore.getSnapshot().lastCompile?.status).toBe('success')
    })
  })

  describe('save', () => {
    it('manual save updates WorkflowStore', async () => {
      documentStore.version = 3
      await service.save('manual')
      const snap = workflowStore.getSnapshot()
      expect(snap.lastSave?.reason).toBe('manual')
      expect(snap.lastSaveVersion).toBe(3)
    })

    it('autosave updates WorkflowStore', async () => {
      await service.save('autosave')
      expect(workflowStore.getSnapshot().lastSave?.reason).toBe('autosave')
    })
  })

  describe('document lifecycle', () => {
    it('saveState is "saved" after initialization', () => {
      const snapshot = workflowStore.getSnapshot()
      expect(snapshot.saveState).toBe('saved')
      expect(snapshot.lastSavedAt).toBeGreaterThan(0)
    })

    it('transitions saveState during successful save', async () => {
      expect(workflowStore.getSnapshot().saveState).toBe('saved')

      // Simulate a command by incrementing document version
      documentStore.version++

      const savePromise = service.save('manual')
      expect(workflowStore.getSnapshot().saveState).toBe('saving')

      await savePromise
      const snapshot = workflowStore.getSnapshot()
      expect(snapshot.saveState).toBe('saved')
      expect(snapshot.saveError).toBeNull()
      expect(snapshot.lastSaveReason).toBe('manual')
      expect(snapshot.lastSavedAt).toBeGreaterThan(0)
    })

    it('transitions to error state on failed save', async () => {
      // Spy on persistence to make save fail
      const persistence = context.get('persistence') as any
      vi.spyOn(persistence, 'save').mockRejectedValueOnce(new Error('Network error'))

      const savePromise = service.save('manual')
      expect(workflowStore.getSnapshot().saveState).toBe('saving')

      await expect(savePromise).rejects.toThrow('Network error')

      const snapshot = workflowStore.getSnapshot()
      expect(snapshot.saveState).toBe('error')
      expect(snapshot.saveError).toBe('Network error')
      // lastSavedAt should NOT be updated on failure
      expect(snapshot.lastSavedAt).toBeGreaterThan(0)
    })

    it('sets lastSaveReason to autosave for autosave saves', async () => {
      documentStore.version++
      await service.save('autosave')
      const snapshot = workflowStore.getSnapshot()
      expect(snapshot.lastSaveReason).toBe('autosave')
      expect(snapshot.saveState).toBe('saved')
    })

    it('emits workflow.saved event only after persistence succeeds', async () => {
      const eventBus = context.get('eventBus') as any
      const emitSpy = vi.fn()
      eventBus.on('workflow.saved', emitSpy)

      documentStore.version++
      await service.save('manual')

      expect(emitSpy).toHaveBeenCalledTimes(1)
      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'manual', timestamp: expect.any(Number) })
      )
    })
  })

  describe('publish', () => {
    it('rejects if document is dirty', async () => {
      documentStore.version = 10
      workflowStore.setLastSaveVersion(5)
      const result = await service.publish()
      expect(result.success).toBe(false)
      expect(result.message).toContain('Save')
    })

    it('rejects if compile fails', async () => {
      // Re-init with failing compile
      const failCtx = buildContext({ compileSuccess: false })
      await service.init(failCtx)
      documentStore.version = 5
      workflowStore.setLastSaveVersion(5)
      const result = await service.publish()
      expect(result.success).toBe(false)
      expect(result.message).toContain('Compile')
    })

    it('publishes successfully when clean and compile succeeds', async () => {
      documentStore.version = 5
      workflowStore.setLastSaveVersion(5)
      const result = await service.publish()
      expect(result.success).toBe(true)
      expect(workflowStore.getSnapshot().lastPublish).not.toBeNull()
    })
  })
})
