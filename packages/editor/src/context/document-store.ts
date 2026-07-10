import type { CampusDocument } from '@navi/core'

export class DocumentStore {
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
