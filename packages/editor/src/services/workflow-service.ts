import { BaseEditorService } from '../context'
import type { EditorServiceContext } from '../context/service-registry'
import type { CampusDocument } from '@navi/core'
import type { NavigationCompiler, CompileResult } from './navigation-compiler'
import type { PersistenceService, PublishResult } from './persistence-service'
import type { WorkflowStore, ValidationResult, SyncStatus } from './workflow-store'
import type { ValidationRegistry } from '../validation/registry'
import type { DocumentStore } from '../context/document-store'
import type { DocumentEventBus } from '../eventbus'

// ── WorkflowService ───────────────────────────────────────────

/**
 * Orchestration service for the editor workflow.
 *
 * Coordinates NavigationCompiler, PersistenceService, ValidationRegistry,
 * and DocumentStore. Owns the manual/autosave distinction and event logic.
 *
 * WorkflowService is a pure orchestrator — it owns NO state.
 * All state lives in WorkflowStore.
 *
 * INVARIANT: WorkflowService is the ONLY public workflow API.
 * UI code calls WorkflowService.validate/compile/save/publish.
 * No UI code calls PersistenceService or NavigationCompiler directly.
 */
export class WorkflowService extends BaseEditorService {
  readonly id = 'workflow'
  readonly dependencies: readonly string[] = [
    'navigationCompiler', 'persistence', 'validation',
    'documentStore', 'workflowStore', 'eventBus',
  ] as const

  private navCompiler!: NavigationCompiler
  private persistence!: PersistenceService
  private validation!: ValidationRegistry
  private documentStore!: DocumentStore
  private workflowStore!: WorkflowStore
  private eventBus!: DocumentEventBus
  private document!: CampusDocument

  async init(context: EditorServiceContext): Promise<void> {
    await super.init(context)
    this.navCompiler = context.get('navigationCompiler')
    this.persistence = context.get('persistence')
    this.validation = context.get('validation')
    this.documentStore = context.get('documentStore')
    this.workflowStore = context.get('workflowStore')
    this.eventBus = context.get('eventBus')
    this.document = context.document

    // Document is clean on load — no edits since initialization
    this.workflowStore.updateLifecycle({
      saveState: 'saved',
      lastSavedAt: Date.now(),
    })
    this.workflowStore.setLastSaveVersion(this.documentStore.version)
  }

  // ── Derived state ───────────────────────────────────────────

  /**
   * Returns true if the document has changed since the last save.
   * Uses DocumentStore.version as source of truth — no deep comparison.
   * Gracefully returns false if services haven't been initialized yet.
   */
  isDirty(): boolean {
    if (!this.documentStore) return false
    return this.documentStore.version > this.workflowStore.getSnapshot().lastSaveVersion
  }

  canAutosave(): boolean {
    if (!this.documentStore) return false
    return this.isDirty() && this.workflowStore.getSnapshot().saveState !== 'saving'
  }

  // ── Actions ─────────────────────────────────────────────────

  /**
   * Run full validation on the current document.
   * @deprecated Use ValidationService instead. This method now delegates to
   * ValidationService and converts the result to the legacy format.
   */
  async validate(): Promise<ValidationResult> {
    const validationService = this._context?.get('validationService')
    if (validationService) {
      await validationService.validateNow()
      const snap = validationService.getSnapshot()
      return {
        passed: snap.summary.total - snap.summary.errors - snap.summary.warnings,
        failed: snap.summary.errors + snap.summary.warnings,
        errors: snap.issues.filter(i => i.severity === 'error').map(i => i.message),
        timestamp: Date.now(),
      }
    }
    const issues = this.validation.validateAll(this.document)
    const result: ValidationResult = {
      passed: issues.filter((i) => i.severity !== 'error' && i.severity !== 'warning').length,
      failed: issues.filter((i) => i.severity === 'error' || i.severity === 'warning').length,
      errors: issues.filter((i) => i.severity === 'error').map((i) => i.message),
      timestamp: Date.now(),
    }
    this.workflowStore.setValidation(result)
    return result
  }

  /**
   * Compile the current document into navigation artifacts.
   * Delegates to NavigationCompiler. Writes result to WorkflowStore.
   */
  async compile(): Promise<CompileResult> {
    const result = await this.navCompiler.compile(this.document)
    this.workflowStore.setCompile(result)
    return result
  }

  /**
   * Save the current document.
   *
   * Lifecycle: saved → saving → saved (success) | error (failure)
   *
   * On success: updates lastSavedAt, lastSaveReason, emits workflow.saved event.
   * On failure: captures saveError, does NOT update lastSavedAt or lastSaveReason.
   *             Rethrows so callers can handle (toast, retry, etc.).
   *
   * Both paths update WorkflowStore.lastSave and WorkflowStore.lastSaveVersion.
   */
  async save(reason: 'manual' | 'autosave'): Promise<void> {
    this.workflowStore.updateLifecycle({ saveState: 'saving' })
    try {
      await this.persistence.save()
      this.workflowStore.setSave(Date.now(), reason)
      this.workflowStore.setLastSaveVersion(this.documentStore.version)
      this.workflowStore.updateLifecycle({
        saveState: 'saved',
        saveError: null,
        lastSaveReason: reason,
        lastSavedAt: Date.now(),
      })
      if (reason === 'manual') {
        this.eventBus.emit('workflow.saved', { timestamp: Date.now(), reason })
      }
    } catch (err: any) {
      this.workflowStore.updateLifecycle({
        saveState: 'error',
        saveError: err?.message ?? 'Save failed',
      })
      throw err
    }
  }

  /**
   * Publish the campus.
   *
   * 1. Checks isDirty() → rejects if dirty (user must save first)
   * 2. Runs compile fresh (never uses cached result)
   * 3. On compile error → writes to WorkflowStore, returns error
   * 4. On compile success → publishes via PersistenceService
   * 5. On publish success → writes to WorkflowStore
   */
  async publish(): Promise<PublishResult> {
    if (this.isDirty()) {
      return { success: false, message: 'Save your changes before publishing' }
    }

    // Always compile fresh
    const compileResult = await this.compile()
    if (compileResult.status !== 'success' || !compileResult.artifacts) {
      return { success: false, message: compileResult.message ?? 'Compilation failed' }
    }

    // Publish compiled artifacts
    const publishResult = await this.persistence.publish(compileResult.artifacts)
    if (publishResult.success) {
      this.workflowStore.setPublish(Date.now())
    }
    return publishResult
  }
}
