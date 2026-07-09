import type { CampusDocument } from '@navi/core'
import type { Command } from './commands/types'
import { CommandDispatcher } from './commands/dispatcher'
import { CommandRegistry } from './commands/registry'
import type { PreHook, PostHook } from './commands/types'

export interface HistoryEntry {
  command: Command
  handlerId: string
  inverse: Command | null
  beforeHash: string
  afterHash: string
  snapshotBefore?: CampusDocument
  snapshotAfter?: CampusDocument
  estimatedSize: number
}

function hash(obj: unknown): string {
  const str = JSON.stringify(obj)
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i)
    h |= 0
  }
  return h.toString(36)
}

function estimateSize(obj: unknown): number {
  return JSON.stringify(obj).length * 2
}

export class HistoryStack implements PreHook, PostHook {
  id = 'history-stack'

  private past: HistoryEntry[] = []
  private future: HistoryEntry[] = []
  private maxMemory: number
  private currentMemory = 0
  private pendingBeforeHash: string | null = null
  private pendingSnapshot: CampusDocument | null = null

  constructor(
    private dispatcher: CommandDispatcher,
    private document: CampusDocument,
    private registry: CommandRegistry,
    maxMemoryMB = 200,
  ) {
    this.maxMemory = maxMemoryMB * 1024 * 1024
  }

  before(command: Command): void {
    this.pendingBeforeHash = hash(this.document)
    this.pendingSnapshot = structuredClone(this.document)
  }

  after(command: Command, result: any): void {
    if (!result.success) return
    this.push(command, result)
    this.pendingBeforeHash = null
    this.pendingSnapshot = null
  }

  push(command: Command, result: { entityId?: string; data?: Record<string, unknown> }): void {
    const handler = this.registry.get(command.id)
    if (!handler) return

    const beforeHash = this.pendingBeforeHash || hash(this.document)
    const afterHash = hash(this.document)
    const inverse = handler.inverse ? handler.inverse(command.payload, { success: true, entityId: result.entityId, data: result.data }) : null
    const needsSnapshot = inverse === null

    if (needsSnapshot && !this.pendingSnapshot) {
      this.pendingSnapshot = structuredClone(this.document)
    }
    const snapshotBefore = needsSnapshot ? this.pendingSnapshot! : undefined
    const snapshotAfter = needsSnapshot ? structuredClone(this.document) : undefined

    const entry: HistoryEntry = {
      command,
      handlerId: command.id,
      inverse,
      beforeHash,
      afterHash,
      snapshotBefore,
      snapshotAfter,
      estimatedSize: estimateSize({ command, inverse, snapshotBefore, snapshotAfter }),
    }

    this.past.push(entry)
    this.currentMemory += entry.estimatedSize
    this.future = []

    this.evictIfNeeded()
  }

  undo(): boolean {
    const entry = this.past.pop()
    if (!entry) return false
    this.currentMemory -= entry.estimatedSize

    if (entry.inverse) {
      const inverseCmd: Command = {
        id: entry.inverse.id,
        label: `Undo ${entry.command.label}`,
        payload: entry.inverse.payload,
      }
      this.dispatcher.execute(inverseCmd, { skipHooks: true })
    } else if (entry.snapshotBefore) {
      Object.assign(this.document, entry.snapshotBefore)
    } else {
      return false
    }

    this.future.push(entry)
    return true
  }

  redo(): boolean {
    const entry = this.future.pop()
    if (!entry) return false

    if (entry.snapshotAfter) {
      Object.assign(this.document, entry.snapshotAfter)
    } else {
      this.dispatcher.execute(entry.command, { skipHooks: true })
    }

    this.past.push(entry)
    this.currentMemory += entry.estimatedSize
    return true
  }

  clear(): void {
    this.past = []
    this.future = []
    this.currentMemory = 0
  }

  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }
  get undoCount(): number { return this.past.length }
  get redoCount(): number { return this.future.length }
  get memoryUsage(): number { return this.currentMemory }

  private evictIfNeeded(): void {
    while (this.currentMemory > this.maxMemory && this.past.length > 1) {
      const oldest = this.past.shift()
      if (oldest) {
        this.currentMemory -= oldest.estimatedSize
      }
    }
  }
}
