import { BaseEditorService } from '../context'
import type { EditorServiceContext } from '../context/service-registry'
import type { CampusDocument } from '@navi/core'
import type { NavigationCompiler, CompileResult } from './navigation-compiler'
import type { PersistenceService } from './persistence-service'
import type { WorkflowStore, ValidationResult, SyncStatus } from './workflow-store'
import type { DocumentStore } from '../context/document-store'
import type { DocumentEventBus } from '../eventbus'

// ── WorkflowService ───────────────────────────────────────────

/**
 * Orchestration service for the editor workflow.
 *
 * Tracks document state via a state machine:
 *   saved → dirty → saving → dirty-while-saving → dirty → saved
 *
 * Owns NO save logic. AutosaveService handles debounce, queue, and snapshot.
 * WorkflowService only tracks state and exposes lifecycle methods.
 *
 * INVARIANT: WorkflowService is the ONLY public workflow API.
 * UI code calls WorkflowService methods. No UI code calls
 * PersistenceService or NavigationCompiler directly.
 */
export class WorkflowService extends BaseEditorService {
  readonly id = 'workflow'
  readonly dependencies: readonly string[] = [
    'navigationCompiler', 'persistence',
    'documentStore', 'workflowStore', 'eventBus',
  ] as const

  private navCompiler!: NavigationCompiler
  private persistence!: PersistenceService
  private documentStore!: DocumentStore
  private workflowStore!: WorkflowStore
  private eventBus!: DocumentEventBus
  private document!: CampusDocument
  private revisionUnsub: (() => void) | null = null

  async init(context: EditorServiceContext): Promise<void> {
    await super.init(context)
    this.navCompiler = context.get('navigationCompiler')
    this.persistence = context.get('persistence')
    this.documentStore = context.get('documentStore')
    this.workflowStore = context.get('workflowStore')
    this.eventBus = context.get('eventBus')
    this.document = context.document

    // Document is clean on load
    this.workflowStore.updateLifecycle({
      saveState: 'saved',
      lastSavedAt: Date.now(),
    })
    this.workflowStore.setLastSaveVersion(this.documentStore.version)

    // React to every committed revision
    this.revisionUnsub = this.eventBus.on('revision.committed', () => this.mutate())
  }

  async destroy(): Promise<void> {
    this.revisionUnsub?.()
    await super.destroy()
  }

  // ── State machine ──────────────────────────────────────────

  /**
   * Called when a new revision is committed (via eventBus listener).
   * Transitions state based on current state.
   */
  mutate(): void {
    const snap = this.workflowStore.getSnapshot()
    if (snap.saveState === 'saving') {
      this.workflowStore.updateLifecycle({ saveState: 'dirty-while-saving' })
    } else if (snap.saveState === 'saved') {
      this.workflowStore.updateLifecycle({ saveState: 'dirty' })
    }
  }

  // ── Derived state ───────────────────────────────────────────

  isDirty(): boolean {
    if (!this.workflowStore) return false
    const snap = this.workflowStore.getSnapshot()
    return snap.saveState === 'dirty' || snap.saveState === 'dirty-while-saving'
  }

  canAutosave(): boolean {
    if (!this.workflowStore) return false
    return this.isDirty() && !this.isSaving()
  }

  isSaving(): boolean {
    if (!this.workflowStore) return false
    return this.workflowStore.getSnapshot().saveState === 'saving'
  }

  hasUnsavedChanges(): boolean {
    return this.isDirty()
  }

  canPublish(): boolean {
    return !this.isSaving() && !this.isDirty()
  }

  // ── Actions ─────────────────────────────────────────────────

  async validate(): Promise<ValidationResult> {
    const validationEngine = this._context?.get('validationEngine')
    if (validationEngine) {
      const snapshot = validationEngine.validate(this.document, 'publish')
      return {
        passed: snapshot.statistics.totalIssues - snapshot.statistics.errors - snapshot.statistics.warnings,
        failed: snapshot.statistics.errors + snapshot.statistics.warnings,
        errors: snapshot.issues.filter(i => i.severity === 'error').map(i => i.message),
        timestamp: Date.now(),
      }
    }
    return { passed: 0, failed: 0, errors: [], timestamp: Date.now() }
  }

  async compile(): Promise<CompileResult> {
    const result = await this.navCompiler.compile(this.document)
    this.workflowStore.setCompile(result)
    return result
  }

  /**
   * Save the current document.
   *
   * Lifecycle: dirty → saving → dirtyWhileSaving → dirty → saving → saved
   *
   * On success: updates lastSavedAt, emits workflow.saved (manual only).
   * If edits happened during save: transitions back to dirty for re-save.
   * On failure: stays dirty for retry.
   */
  async save(reason: 'manual' | 'autosave'): Promise<void> {
    this.workflowStore.updateLifecycle({ saveState: 'saving' })
    try {
      await this.persistence.save()
      this.saveComplete(reason)
    } catch (err: any) {
      this.saveFailed(err)
      throw err
    }
  }

  private saveComplete(reason: 'manual' | 'autosave'): void {
    const snap = this.workflowStore.getSnapshot()
    const wasDirtyWhileSaving = snap.saveState === 'dirty-while-saving'

    this.workflowStore.setSave(Date.now(), reason)
    this.workflowStore.setLastSaveVersion(this.documentStore.version)

    if (wasDirtyWhileSaving) {
      this.workflowStore.updateLifecycle({
        saveState: 'dirty',
        saveError: null,
      })
    } else {
      this.workflowStore.updateLifecycle({
        saveState: 'saved',
        saveError: null,
        lastSaveReason: reason,
        lastSavedAt: Date.now(),
      })
    }

    if (reason === 'manual') {
      this.eventBus.emit('workflow.saved', { timestamp: Date.now(), reason })
    }
  }

  private saveFailed(err: any): void {
    this.workflowStore.updateLifecycle({
      saveState: 'dirty',
      saveError: err?.message ?? 'Save failed',
    })
  }
}