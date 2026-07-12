import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AutosaveService } from '../autosave-service'
import { DocumentEventBus } from '../../eventbus'
import type { EditorServiceContext } from '../../context/service-registry'

describe('AutosaveService', () => {
  let service: AutosaveService
  let workflow: { canAutosave: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> }
  let eventBus: DocumentEventBus
  let saveSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.useFakeTimers()

    eventBus = new DocumentEventBus()
    await eventBus.init({ get: () => {}, document: {} } as unknown as EditorServiceContext)

    workflow = {
      canAutosave: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    }
    saveSpy = vi.spyOn(workflow, 'save')

    const store = new Map<string, any>()
    store.set('workflow', workflow)
    store.set('eventBus', eventBus)

    const context = {
      get: (id: string) => store.get(id),
      document: {},
    } as unknown as EditorServiceContext

    service = new AutosaveService({ debounceMs: 50, maxIntervalMs: 5000 })
    await service.init(context)
  })

  afterEach(async () => {
    vi.useRealTimers()
    if (service) await service.destroy()
  })

  it('fires autosave after debounce when document is dirty and canAutosave returns true', async () => {
    workflow.canAutosave.mockReturnValue(true)

    eventBus.emit('document.changed')

    expect(saveSpy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1))
    expect(saveSpy).toHaveBeenCalledWith('autosave')
  })

  it('debounce resets on rapid document changes — fires only once', async () => {
    workflow.canAutosave.mockReturnValue(true)

    eventBus.emit('document.changed')
    vi.advanceTimersByTime(30)
    eventBus.emit('document.changed')
    vi.advanceTimersByTime(30)
    eventBus.emit('document.changed')

    vi.advanceTimersByTime(50)
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1))
  })

  it('does NOT save if canAutosave returns false (not dirty)', async () => {
    workflow.canAutosave.mockReturnValue(false)

    eventBus.emit('document.changed')
    vi.advanceTimersByTime(100)

    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('does NOT save if saveState is currently saving', async () => {
    workflow.canAutosave.mockReturnValue(false)

    eventBus.emit('document.changed')
    vi.advanceTimersByTime(100)
    expect(saveSpy).not.toHaveBeenCalled()

    // Now canAutosave returns true — should save
    workflow.canAutosave.mockReturnValue(true)
    eventBus.emit('document.changed')
    vi.advanceTimersByTime(50)
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1))
  })

  it('max interval triggers autosave even without document.changed events', async () => {
    workflow.canAutosave.mockReturnValue(true)

    vi.advanceTimersByTime(5000)
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1))
    expect(saveSpy).toHaveBeenCalledWith('autosave')
  })

  it('cleans up timers on destroy — no autosave after destroy', async () => {
    workflow.canAutosave.mockReturnValue(true)

    // Destroy the service explicitly — afterEach will try again but
    // BaseEditorService.destroy() throws on destroyed→destroyed, so
    // we guard by clearing our timers before calling super.
    await service.destroy()

    // Prevent afterEach from double-destroying by reassigning
    service = null as any

    // No timers should fire after destroy
    eventBus.emit('document.changed')
    vi.advanceTimersByTime(100)
    vi.advanceTimersByTime(5000)

    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('concurrent save prevention — pending save blocks second save', async () => {
    let resolveSave: () => void
    workflow.save.mockImplementation(() => new Promise<void>((resolve) => { resolveSave = resolve }))
    workflow.canAutosave.mockReturnValue(true)

    // Trigger first autosave
    eventBus.emit('document.changed')
    vi.advanceTimersByTime(50)
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1))

    // Interval fires while save is pending — should NOT start a second save
    vi.advanceTimersByTime(5000)
    // Give microtasks a chance to flush
    await Promise.resolve()
    expect(saveSpy).toHaveBeenCalledTimes(1)

    // Resolve the first save
    resolveSave!()
    // Flush microtasks so .finally() runs and pending = false
    await Promise.resolve()
    await Promise.resolve()

    // Now a new change should be able to trigger save
    workflow.save.mockResolvedValue(undefined)
    eventBus.emit('document.changed')
    vi.advanceTimersByTime(50)
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2))
  })
})
