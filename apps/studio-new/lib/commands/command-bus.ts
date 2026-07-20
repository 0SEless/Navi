/**
 * Stage 4.5 — CommandBus
 *
 * The single legal mutation path for CampusDocument.
 *
 * ┌──────────┐
 * │ Command  │  { type, payload }
 * └────┬─────┘
 *      ▼
 * ┌──────────┐
 * │ Bus      │  routes to registered handler
 * └────┬─────┘
 *      ▼
 * ┌──────────┐
 * │ Handler  │  mutates document
 * └──────────┘
 *      ▼
 * ┌─────────────┐
 * │ didExecute  │  → re-renderers, history, etc.
 * └─────────────┘
 *
 * Architectural invariants:
 *   - No direct mutation of CampusDocument outside command handlers.
 *   - Inspector, Canvas, AI, etc. all go through CommandBus.
 *   - History (undo/redo) attaches here without touching other layers.
 */

import type { CampusDocument } from '@navi/core'

// ── Command types ──────────────────────────────────────────────

export interface EntityUpdatePayload {
  id: string
  type: string
  changes: Record<string, unknown>
}

export interface EntityCreatePayload {
  type: string
  data: Record<string, unknown>
}

export interface EntityDeletePayload {
  id: string
  type: string
}

export type CommandPayload =
  | { type: 'entity.update'; payload: EntityUpdatePayload }
  | { type: 'entity.create'; payload: EntityCreatePayload }
  | { type: 'entity.delete'; payload: EntityDeletePayload }

export type Command = CommandPayload

// ── Handler ────────────────────────────────────────────────────

export interface CommandHandler {
  readonly commandType: string
  execute(context: { document: CampusDocument }, command: Command): void
}

// ── Bus ────────────────────────────────────────────────────────

export class CommandBus {
  private handlers = new Map<string, CommandHandler>()
  private listeners = new Set<() => void>()
  private _document: CampusDocument

  constructor(document: CampusDocument) {
    this._document = document
  }

  /** Register a handler for a command type. */
  register(handler: CommandHandler): void {
    this.handlers.set(handler.commandType, handler)
  }

  /** Execute a command. Returns true if handled, false if no handler registered. */
  execute(command: Command): boolean {
    const handler = this.handlers.get(command.type)
    if (!handler) {
      console.warn(`[CommandBus] No handler for "${command.type}"`)
      return false
    }
    handler.execute({ document: this._document }, command)
    this.notify()
    return true
  }

  /** Get the current document (mutated in-place by handlers). */
  get document(): CampusDocument {
    return this._document
  }

  /** Replace the document reference (used when loading a new document). */
  setDocument(doc: CampusDocument): void {
    this._document = doc
  }

  /** Subscribe to post-execution notifications. Returns unsubscribe. */
  onDidExecute(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}
