import type { CampusDocument } from '@navi/core'
import type { Command, PreHook, PostHook } from './types'
import { CommandRegistry } from './registry'
import { DocumentEventBus } from '../eventbus'

export interface ExecuteOptions {
  skipHooks?: boolean
}

export class CommandDispatcher {
  private preHooks: PreHook[] = []
  private postHooks: PostHook[] = []

  constructor(
    private registry: CommandRegistry,
    private document: CampusDocument,
    private eventBus: DocumentEventBus,
  ) {}

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

    return result
  }
}
