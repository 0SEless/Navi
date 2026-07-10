import type { CampusDocument } from '@navi/core'
import type { Command, PreHook, PostHook } from './types'
import { CommandRegistry } from './registry'
import { BaseEditorService } from '../context'
import type { EditorServiceContext } from '../context/service-registry'
import type { DocumentStore } from '../context/document-store'
import type { DocumentEventBus } from '../eventbus'

export interface ExecuteOptions {
  skipHooks?: boolean
}

export class CommandDispatcher extends BaseEditorService {
  readonly id = 'dispatcher'
  readonly dependencies: readonly string[] = ['eventBus']

  private registry: CommandRegistry
  private document: CampusDocument
  private eventBus!: DocumentEventBus
  private documentStore?: DocumentStore
  private preHooks: PreHook[] = []
  private postHooks: PostHook[] = []

  constructor(registry?: CommandRegistry, document?: CampusDocument, eventBus?: DocumentEventBus) {
    super()
    this.registry = registry ?? new CommandRegistry()
    this.document = document ?? ({} as CampusDocument)
    this.eventBus = eventBus ?? ({} as DocumentEventBus)
  }

  async init(context: EditorServiceContext): Promise<void> {
    await super.init(context)
    this.eventBus = context.get('eventBus')
    this.document = context.document
    this.documentStore = context.get('documentStore')
  }

  addPreHook(hook: PreHook): void {
    this.preHooks.push(hook)
  }

  removePreHook(id: string): void {
    this.preHooks = this.preHooks.filter(h => h.id !== id)
  }

  addPostHook(hook: PostHook): void {
    this.postHooks.push(hook)
  }

  removePostHook(id: string): void {
    this.postHooks = this.postHooks.filter(h => h.id !== id)
  }

  execute(command: Command, options?: ExecuteOptions): any {
    const handler = this.registry.get(command.id)
    if (!handler) {
      throw new Error(`Unknown command: ${command.id}`)
    }

    if (!options?.skipHooks) {
      for (const hook of this.preHooks) {
        hook.before(command, this.document)
      }
    }

    const result = handler.execute(this.document, command.payload)

    if (result.success && !options?.skipHooks) {
      this.eventBus.transaction(() => {
        for (const hook of this.postHooks) {
          hook.after(command, result, this.document)
        }
        this.eventBus.emit('entity.' + (command.id.includes('create') ? 'created' : command.id.includes('delete') ? 'deleted' : 'updated'), {
          entityId: result.entityId,
          entityType: command.id.split('.')[0],
        })
      })
    }

    // FROZEN order: handler → (postHooks + entity.updated) → documentStore.commit() → document.changed
    // commit() + document.changed run on every successful command, including skipHooks (undo/redo),
    // so React re-renders (useDocumentVersion) even when history recording is suppressed.
    if (result.success) {
      this.documentStore?.commit()
      this.eventBus.emit('document.changed', {
        version: this.documentStore?.version,
        entityId: result.entityId,
        entityType: command.id.split('.')[0],
      })
    }

    return result
  }
}
