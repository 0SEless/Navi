import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ValidationService } from '../validation-service'
import { ValidationStore } from '../validation-store'
import { ValidationEngine, ValidationRegistry } from '../../validation'
import { DocumentEventBus } from '../../eventbus'
import type { EditorServiceContext } from '../../context/service-registry'
import type { ValidationIssue } from '../../validation/registry'

describe('ValidationService', () => {
  let service: ValidationService
  let eventBus: DocumentEventBus
  let registry: ValidationRegistry
  let engine: ValidationEngine
  let store: ValidationStore
  let documentStore: { version: number; document: any }

  beforeEach(async () => {
    vi.useFakeTimers()

    eventBus = new DocumentEventBus()
    await eventBus.init({ get: () => {}, document: {} } as unknown as EditorServiceContext)

    registry = new ValidationRegistry()
    registry.register({
      id: 'test', label: 'Test', scope: 'entity', cost: 'cheap',
      validate: () => [{
        id: 'test:all:abc', severity: 'error' as const, category: 'geometry' as const,
        scope: 'entity' as const, entityId: 'bld-1', entityType: 'building' as const,
        message: 'test error', fixable: false, validatorId: 'test',
      }],
    })

    engine = new ValidationEngine(registry)
    store = new ValidationStore()
    documentStore = { version: 1, document: { metadata: { name: 'test' } } }

    const context = {
      get: (id: string) => {
        const map: Record<string, any> = { eventBus, documentStore }
        return map[id]
      },
      document: documentStore.document,
    } as unknown as EditorServiceContext

    service = new ValidationService(engine, store, { debounceMs: 100 })
    await service.init(context)
  })

  afterEach(async () => {
    service.destroy()
    vi.useRealTimers()
  })

  it('initial snapshot has no issues', () => {
    const snap = service.getSnapshot()
    expect(snap.issues).toHaveLength(0)
    expect(snap.isValid).toBe(true)
  })

  it('isValid returns true when no errors', () => {
    expect(service.isValid()).toBe(true)
  })

  it('hasErrors returns false when no errors', () => {
    expect(service.hasErrors()).toBe(false)
  })

  it('runs validation after document.changed with debounce', async () => {
    eventBus.emit('document.changed')
    // Before debounce fires - should not have run
    expect(store.getSnapshot().issues).toHaveLength(0)
    vi.advanceTimersByTime(100)
    await vi.waitFor(() => expect(store.getSnapshot().issues.length).toBeGreaterThan(0))
  })

  it('debounce resets on rapid changes — runs once', async () => {
    eventBus.emit('document.changed')
    vi.advanceTimersByTime(50)
    eventBus.emit('document.changed')
    vi.advanceTimersByTime(50)
    eventBus.emit('document.changed')
    vi.advanceTimersByTime(100)
    await vi.waitFor(() => {
      expect(store.getSnapshot().lastValidatedRevision).toBe(1)
    })
  })

  it('validateNow forces immediate validation', async () => {
    await service.validateNow()
    expect(store.getSnapshot().issues.length).toBeGreaterThan(0)
    expect(store.getSnapshot().lastValidatedRevision).toBe(1)
  })

  it('sets runningRevision during validation', async () => {
    const validatePromise = service.validateNow()
    expect(store.getSnapshot().runningRevision).toBe(1)
    await validatePromise
    expect(store.getSnapshot().runningRevision).toBeNull()
  })

  it('cleans up timers on destroy', async () => {
    service.destroy()
    eventBus.emit('document.changed')
    vi.advanceTimersByTime(200)
    expect(store.getSnapshot().issues).toHaveLength(0)
  })

  it('queues follow-up validation if a change arrives while running', async () => {
    const slowValidator = {
      id: 'slow', label: 'Slow', scope: 'entity' as const, cost: 'cheap' as const,
      validate: () => [] as ValidationIssue[],
    }
    const slowRegistry = new ValidationRegistry()
    slowRegistry.register(slowValidator)
    const slowEngine = new ValidationEngine(slowRegistry)
    const slowStore = new ValidationStore()
    const slowService = new ValidationService(slowEngine, slowStore, { debounceMs: 100 })
    await slowService.init({
      get: (id: string) => {
        const map: Record<string, any> = { eventBus, documentStore }
        return map[id]
      },
      document: documentStore.document,
    } as unknown as EditorServiceContext)

    documentStore.version = 2
    eventBus.emit('document.changed')
    vi.advanceTimersByTime(100)
    documentStore.version = 3
    eventBus.emit('document.changed')

    await vi.waitFor(() => {
      expect(slowStore.getSnapshot().lastValidatedRevision).toBe(3)
    }, { timeout: 10000 })
  })

  it('validateNow updates store with latest revision', async () => {
    documentStore.version = 42
    await service.validateNow()
    expect(store.getSnapshot().lastValidatedRevision).toBe(42)
  })

  it('does not run validation after destroy', async () => {
    service.destroy()
    await service.validateNow()
    expect(store.getSnapshot().issues).toHaveLength(0)
  })
})
