import { BaseEditorService } from '../context'
import type { EditorServiceContext } from '../context/service-registry'
import type { CompiledArtifacts } from './navigation-compiler'

// ── Types ─────────────────────────────────────────────────────

export interface PersistenceAdapter {
  save(): Promise<void>
  syncToSupabase(): Promise<void>
  publish(artifacts: CompiledArtifacts): Promise<PublishResult>
}

export interface PublishResult {
  success: boolean
  version?: string
  message?: string
}

// ── PersistenceService ────────────────────────────────────────

/**
 * Pure persistence service.
 *
 * Wraps the legacy graph-store / Supabase persistence behind an
 * injected adapter. Has NO concept of "manual" vs "autosave" —
 * that distinction belongs to WorkflowService.
 *
 * Emits NO events — WorkflowService decides what events to emit.
 * Caches NO state — success/failure flows through return values.
 */
export class PersistenceService extends BaseEditorService {
  readonly id = 'persistence'
  readonly dependencies: readonly string[] = ['eventBus']

  private _adapter: PersistenceAdapter

  constructor(adapter: PersistenceAdapter) {
    super()
    this._adapter = adapter
  }

  async init(context: EditorServiceContext): Promise<void> {
    await super.init(context)
  }

  /**
   * Persist the current document state.
   * Pure persist — no events, no UI feedback.
   * Use reason parameter at the WorkflowService layer.
   */
  async save(): Promise<void> {
    await this.transitionTo('busy')
    try {
      await this._adapter.save()
      await this.transitionTo('ready')
    } catch (err: any) {
      await this.transitionTo('ready')
      throw err
    }
  }

  /**
   * Publish compiled artifacts.
   * Returns success/failure — WorkflowService handles the rest.
   */
  async publish(artifacts: CompiledArtifacts): Promise<PublishResult> {
    await this.transitionTo('busy')
    try {
      const result = await this._adapter.publish(artifacts)
      await this.transitionTo('ready')
      return result
    } catch (err: any) {
      await this.transitionTo('ready')
      return { success: false, message: err?.message ?? 'Publish failed' }
    }
  }
}
