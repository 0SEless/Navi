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
    store.set('validationEngine', {
      validate: () => ({
        issues: [],
        statistics: { totalIssues: 0, errors: 0, warnings: 0, infos: 0, duration: 0, rulesExecuted: 0, rulesPassed: 0, rulesFailed: 0 },
      }),
    })
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
    it('returns false when state is saved', () => {
      expect(service.isDirty()).toBe(false)
    })

    it('returns true after mutate()', () => {
      service.mutate()
      expect(service.isDirty()).toBe(true)
    })
  })

  describe('validate', () => {
    it('returns validation result', async () => {
      const result = await service.validate()
      expect(result.timestamp).toBeGreaterThan(0)
    })

    it('validation result with errors', async () => {
      const ctx = buildContext()
      const originalGet = ctx.get.bind(ctx)
      ctx.get = (id: string) => {
        if (id === 'validationEngine') return {
          validate: () => ({
            issues: [{ severity: 'error', message: 'Missing name', ruleId: 'test' }],
            statistics: { totalIssues: 1, errors: 1, warnings: 0, infos: 0, duration: 0, rulesExecuted: 0, rulesPassed: 0, rulesFailed: 0 },
          }),
        } as any
        return originalGet(id as any)
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
      service.mutate()
      documentStore.version = 3
      await service.save('manual')
      const snap = workflowStore.getSnapshot()
      expect(snap.lastSave?.reason).toBe('manual')
      expect(snap.lastSaveVersion).toBe(3)
    })

    it('autosave updates WorkflowStore', async () => {
      service.mutate()
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

      service.mutate()

      const savePromise = service.save('manual')
      expect(workflowStore.getSnapshot().saveState).toBe('saving')

      await savePromise
      const snapshot = workflowStore.getSnapshot()
      expect(snapshot.saveState).toBe('saved')
      expect(snapshot.saveError).toBeNull()
      expect(snapshot.lastSaveReason).toBe('manual')
      expect(snapshot.lastSavedAt).toBeGreaterThan(0)
    })

    it('returns to dirty state on failed save', async () => {
      // Spy on persistence to make save fail
      const persistence = context.get('persistence') as any
      vi.spyOn(persistence, 'save').mockRejectedValueOnce(new Error('Network error'))

      service.mutate()
      const savePromise = service.save('manual')
      expect(workflowStore.getSnapshot().saveState).toBe('saving')

      await expect(savePromise).rejects.toThrow('Network error')

      const snapshot = workflowStore.getSnapshot()
      expect(snapshot.saveState).toBe('dirty')
      expect(snapshot.saveError).toBe('Network error')
    })

    it('sets lastSaveReason to autosave for autosave saves', async () => {
      service.mutate()
      await service.save('autosave')
      const snapshot = workflowStore.getSnapshot()
      expect(snapshot.lastSaveReason).toBe('autosave')
      expect(snapshot.saveState).toBe('saved')
    })

    it('emits workflow.saved event only after persistence succeeds', async () => {
      const eventBus = context.get('eventBus') as any
      const emitSpy = vi.fn()
      eventBus.on('workflow.saved', emitSpy)

      service.mutate()
      await service.save('manual')

      expect(emitSpy).toHaveBeenCalledTimes(1)
      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'manual', timestamp: expect.any(Number) })
      )
    })
  })
})
