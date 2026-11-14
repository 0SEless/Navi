import type { Tool, ToolPointerEvent, ToolContext } from './types'
import type { Wall } from '@navi/core'
import { findPlacementWall, projectWallWindow } from '../geometry/door-placement'
import { genId } from '../id'

export interface WindowToolState {
  placing: boolean
  position: { x: number; y: number } | null
  error: string | null
}

export class WindowTool implements Tool {
  readonly id = 'window'
  readonly label = 'Window'
  readonly cursor = 'crosshair'

  private placing = false
  private position: { x: number; y: number } | null = null
  private start: { x: number; y: number } | null = null
  private host: { wall: Wall; buildingId: string; floorId: string } | null = null
  private error: string | null = null

  get state(): WindowToolState {
    return {
      placing: this.placing,
      position: this.position ? { ...this.position } : null,
      error: this.error,
    }
  }

  onActivate(_ctx: ToolContext): void {
    this.reset()
  }

  onDeactivate(_ctx: ToolContext): void {
    this.reset()
  }

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    this.reset()
    if (event.button !== 0) return
    this.placing = true
    this.position = { x: event.x, y: event.y }
    this.start = { ...this.position }
    const buildingId = ctx.services.viewport?.activeBuildingId
    const floorId = ctx.services.viewport?.activeFloorId
    const floor = ctx.document?.buildings.find(b => b.id === buildingId)?.floors.find(f => f.id === floorId)
    const hit = findPlacementWall(floor?.walls ?? [], this.start)
    if (!buildingId || !floorId || !hit.ok) { this.error = hit.ok ? 'Choose an active floor.' : hit.reason; return }
    this.host = { wall: structuredClone(hit.wall), buildingId, floorId }
  }

  onPointerMove(event: ToolPointerEvent, _ctx: ToolContext): void {
    if (!this.placing) return
    this.position = { x: event.x, y: event.y }
  }

  onPointerUp(event: ToolPointerEvent, ctx: ToolContext): void {
    if (!this.placing || !this.start || !this.host) {
      this.reset()
      return
    }

    const { wall, buildingId, floorId } = this.host
    const current = ctx.document?.buildings.find(b => b.id === buildingId)?.floors.find(f => f.id === floorId)?.walls?.find(w => w.id === wall.id)
    if (ctx.services.viewport?.activeBuildingId !== buildingId || ctx.services.viewport?.activeFloorId !== floorId || JSON.stringify(current) !== JSON.stringify(wall)) { this.reset(); return }
    const projected = projectWallWindow(wall, this.start, event)
    if (!projected.ok) { this.error = projected.reason; return }
    const result = ctx.services.dispatcher.execute({
      id: 'opening.create',
      label: 'Create Window',
      payload: { buildingId, floorId, opening: { id: genId('opening'), ...projected.opening, windowAppearance: 'fixed' } },
    })
    if (result?.success === false) { this.error = result.error || 'The window could not be created.'; return }
    this.reset()
  }

  onKeyDown(event: KeyboardEvent, _ctx: ToolContext): void {
    if (event.key === 'Escape') {
      this.reset()
    }
  }

  private reset(): void {
    this.placing = false
    this.position = null
    this.start = null
    this.host = null
    this.error = null
  }
}
