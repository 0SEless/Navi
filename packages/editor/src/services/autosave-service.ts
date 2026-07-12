import { BaseEditorService } from '../context'
import type { EditorServiceContext } from '../context/service-registry'
import type { WorkflowService } from './workflow-service'
import type { DocumentEventBus } from '../eventbus'

export interface AutosaveOptions {
  debounceMs?: number
  maxIntervalMs?: number
}

export class AutosaveService extends BaseEditorService {
  readonly id = 'autosave'
  readonly dependencies = ['workflow', 'eventBus'] as const

  private debounceMs: number
  private maxIntervalMs: number
  private workflow!: WorkflowService
  private eventBus!: DocumentEventBus

  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private maxIntervalTimer: ReturnType<typeof setInterval> | null = null
  private onDocumentChanged!: () => void
  private pending = false

  constructor(options?: AutosaveOptions) {
    super()
    this.debounceMs = options?.debounceMs ?? 5000
    this.maxIntervalMs = options?.maxIntervalMs ?? 30000
  }

  async init(context: EditorServiceContext): Promise<void> {
    await super.init(context)
    this.workflow = context.get('workflow')
    this.eventBus = context.get('eventBus')

    this.onDocumentChanged = () => this.handleDocumentChanged()
    this.eventBus.on('document.changed', this.onDocumentChanged)

    this.maxIntervalTimer = setInterval(() => this.tryAutosave(), this.maxIntervalMs)
  }

  async destroy(): Promise<void> {
    this.clearDebounce()
    if (this.maxIntervalTimer !== null) {
      clearInterval(this.maxIntervalTimer)
      this.maxIntervalTimer = null
    }
    if (this.onDocumentChanged) {
      this.eventBus.off('document.changed', this.onDocumentChanged)
    }
    await super.destroy()
  }

  private handleDocumentChanged(): void {
    this.clearDebounce()
    this.debounceTimer = setTimeout(() => this.tryAutosave(), this.debounceMs)
  }

  private tryAutosave(): void {
    if (this.pending) return
    if (!this.workflow?.canAutosave()) return

    this.pending = true
    void this.workflow.save('autosave').catch(() => {
      // WorkflowStore already records error state in saveState/saveError.
    }).finally(() => {
      this.pending = false
    })
  }

  private clearDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }
}
