import { BaseEditorService } from '../context'
import type { EditorServiceContext } from '../context/service-registry'
import type { DocumentEventBus } from '../eventbus'
import type { DocumentStore } from '../context/document-store'
import type { ValidationEngine } from '../validation/engine'
import type { ValidationIssue } from '../validation/registry'
import type { ValidationStore, ValidationStoreSnapshot } from './validation-store'

export interface ValidationServiceOptions {
  debounceMs?: number
}

export class ValidationService extends BaseEditorService {
  readonly id = 'validationService'
  readonly dependencies = ['eventBus', 'documentStore', 'selection'] as const

  private engine: ValidationEngine
  private store: ValidationStore
  private debounceMs: number
  private eventBus!: DocumentEventBus
  private documentStore!: DocumentStore
  private selection!: { select(id: string): void }

  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private followUpQueued = false
  private destroyed = false
  private running = false

  constructor(engine: ValidationEngine, store: ValidationStore, options?: ValidationServiceOptions) {
    super()
    this.engine = engine
    this.store = store
    this.debounceMs = options?.debounceMs ?? 750
  }

  async init(context: EditorServiceContext): Promise<void> {
    await super.init(context)
    this.eventBus = context.get('eventBus')
    this.documentStore = context.get('documentStore')
    this.selection = context.get('selection')
    this.eventBus.on('document.changed', this.handleChange)
  }

  destroy(): void {
    this.destroyed = true
    this.clearDebounce()
    if (this.eventBus) {
      this.eventBus.off('document.changed', this.handleChange)
    }
  }

  getSnapshot(): ValidationStoreSnapshot {
    return this.store.getSnapshot()
  }

  isValid(): boolean {
    return this.store.getSnapshot().isValid
  }

  hasErrors(): boolean {
    return this.store.getSnapshot().summary.errors > 0
  }

  async validateNow(): Promise<void> {
    if (this.destroyed) return
    await this.runValidation()
  }

  focusIssue(issue: ValidationIssue): void {
    if (issue.entityId && this.selection) {
      this.selection.select(issue.entityId)
    }
  }

  private handleChange = (): void => {
    if (this.destroyed) return
    if (this.running) {
      this.followUpQueued = true
      return
    }
    this.clearDebounce()
    this.debounceTimer = setTimeout(() => {
      void this.runValidation()
    }, this.debounceMs)
  }

  private async runValidation(): Promise<void> {
    if (this.destroyed) return
    this.running = true
    const revision = this.documentStore.version
    this.store.commit({
      issues: this.store.getSnapshot().issues,
      lastValidatedRevision: this.store.getSnapshot().lastValidatedRevision,
      runningRevision: revision,
      pending: true,
    })
    await Promise.resolve()
    try {
      const issues = this.engine.validateAll(this.documentStore.document as any, 'editor')
      this.store.commit({ issues, lastValidatedRevision: revision, runningRevision: null, pending: false })
    } catch (e) {
      this.store.commit({
        issues: [{
          id: `validation-service:crash:${Date.now()}`,
          severity: 'error', category: 'reference', scope: 'campus',
          entityId: null, entityType: null,
          message: `Validation crashed: ${e}`,
          fixable: false, validatorId: 'system',
        }],
        lastValidatedRevision: revision,
        runningRevision: null,
        pending: false,
      })
    } finally {
      this.running = false
      if (this.followUpQueued && !this.destroyed) {
        this.followUpQueued = false
        await this.runValidation()
      }
    }
  }

  private clearDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }
}
