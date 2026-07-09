import type { CampusDocument, Building, Floor, Room } from '@navi/core'
import { DocumentEventBus } from './eventbus'

export interface SelectionState {
  entityIds: string[]
  hoveredEntityId: string | null
  lastSelectedId: string | null
}

export class SelectionManager {
  private entityIds = new Set<string>()
  private _hoveredEntityId: string | null = null
  private _lastSelectedId: string | null = null

  constructor(
    private document: CampusDocument,
    private eventBus: DocumentEventBus,
  ) {}

  select(id: string): void {
    this.clear()
    this.entityIds.add(id)
    this._lastSelectedId = id
    this.emitChange()
  }

  toggle(id: string): void {
    if (this.entityIds.has(id)) {
      this.entityIds.delete(id)
      if (this._lastSelectedId === id) {
        this._lastSelectedId = this.entityIds.values().next().value || null
      }
    } else {
      this.entityIds.add(id)
      this._lastSelectedId = id
    }
    this.emitChange()
  }

  clear(): void {
    this.entityIds.clear()
    this._lastSelectedId = null
    this.emitChange()
  }

  isSelected(id: string): boolean {
    return this.entityIds.has(id)
  }

  setHover(entityId: string | null): void {
    this._hoveredEntityId = entityId
    this.eventBus.emit('selection.changed', { entityIds: this.selectedIds, hoveredEntityId: entityId, lastSelectedId: this._lastSelectedId })
  }

  clearHover(): void {
    this._hoveredEntityId = null
  }

  resetOnToolChange(): void {
    this.clear()
    this._hoveredEntityId = null
  }

  get selectedIds(): string[] {
    return Array.from(this.entityIds)
  }

  get count(): number {
    return this.entityIds.size
  }

  get hoveredEntityId(): string | null {
    return this._hoveredEntityId
  }

  get lastSelectedId(): string | null {
    return this._lastSelectedId
  }

  get state(): SelectionState {
    return {
      entityIds: this.selectedIds,
      hoveredEntityId: this._hoveredEntityId,
      lastSelectedId: this._lastSelectedId,
    }
  }

  get boundingBox(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const ids = this.selectedIds
    if (ids.length === 0) return null

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (const bld of this.document.buildings) {
      if (!ids.includes(bld.id)) continue
      for (const pt of bld.footprint.points) {
        if (pt.lng < minX) minX = pt.lng
        if (pt.lat < minY) minY = pt.lat
        if (pt.lng > maxX) maxX = pt.lng
        if (pt.lat > maxY) maxY = pt.lat
      }
    }

    if (minX === Infinity) return null
    return { minX, minY, maxX, maxY }
  }

  private emitChange(): void {
    this.eventBus.emit('selection.changed', this.state)
  }
}
