/**
 * Stage 4.1 — SelectionManager
 *
 * Single source of truth for "what is selected."
 *
 * Architectural rules:
 *   - NO MapLibre awareness
 *   - NO rendering logic
 *   - NO commands
 *   - Just a single selectedEntity: { type, id } | null
 *
 * Consumers (HighlightOverlay, Inspector) observe via onChange().
 * Producers (hit-testing, explorer tree) call select() / clear().
 */

export interface EntityRef {
  type: 'building' | 'room' | 'hallway' | 'road' | 'entrance' | 'staircase' | 'elevator'
  id: string
}

type Listener = (entity: EntityRef | null) => void

export class SelectionManager {
  private _entity: EntityRef | null = null
  private listeners = new Set<Listener>()

  /** Select an entity. Pass null to clear. */
  select(entity: EntityRef | null): void {
    // Id-equality short-circuit: no-op if same entity
    if (
      entity &&
      this._entity &&
      entity.type === this._entity.type &&
      entity.id === this._entity.id
    ) {
      return
    }
    this._entity = entity
    this.notify()
  }

  /** Shorthand: select by type and id. */
  selectBy(type: EntityRef['type'], id: string): void {
    this.select({ type, id })
  }

  /** Clear selection. */
  clear(): void {
    this.select(null)
  }

  /** Get the currently selected entity. */
  get selected(): EntityRef | null {
    return this._entity
  }

  /** Subscribe to selection changes. Returns unsubscribe function. */
  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this._entity)
    }
  }
}
