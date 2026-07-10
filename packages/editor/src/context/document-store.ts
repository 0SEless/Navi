import type { CampusDocument } from '@navi/core'

/**
 * DocumentStore is a plain data holder (editor-owned render-subscription
 * source). It carries a `dependencies` field so it can be safely registered
 * in the ServiceRegistry (registry.init reads `dependencies` for its
 * topological sort) without needing full EditorService lifecycle.
 */
export class DocumentStore {
  readonly dependencies: readonly string[] = []
  version = 0
  revision = '' // reserved changeId/revisionId

  private listeners = new Set<() => void>()

  constructor(public readonly document: CampusDocument) {}

  getVersion = (): number => this.version

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Increment version AND notify React subscribers (useDocumentVersion). */
  commit(): void {
    this.version++
    this.listeners.forEach((l) => l())
  }
}
