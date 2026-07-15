import type { Tool, ToolPointerEvent, ToolContext } from './types'

let dragging = false
let dragStart: { lng: number; lat: number } | null = null
let adjustBuildingId: string | null = null
let originalFootprint: { lat: number; lng: number }[] | null = null

export const buildingAdjustTool: Tool = {
  id: 'building-adjust',
  label: 'Adjust Building',
  cursor: 'move',

  onActivate(ctx: ToolContext): void {
    dragging = false
    dragStart = null
    adjustBuildingId = null
    originalFootprint = null
  },

  onDeactivate(_ctx: ToolContext): void {
    dragging = false
    dragStart = null
    adjustBuildingId = null
    originalFootprint = null
  },

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    const docStore = ctx.services.documentStore
    const doc = docStore?.document
    if (!doc) return

    for (const building of doc.buildings) {
      const pts = building.footprint?.points ?? []
      if (pts.length >= 3 && pointInPolygon(event.lat, event.lng, pts)) {
        adjustBuildingId = building.id
        dragStart = { lng: event.lng, lat: event.lat }
        originalFootprint = pts.map(p => ({ ...p }))
        dragging = true
        return
      }
    }
  },

  onPointerMove(event: ToolPointerEvent, ctx: ToolContext): void {
    if (!dragging || !dragStart || !adjustBuildingId || !originalFootprint) return

    const docStore = ctx.services.documentStore
    const doc = docStore?.document
    if (!doc) return

    const deltaLat = event.lat - dragStart.lat
    const deltaLng = event.lng - dragStart.lng

    const building = doc.buildings.find(b => b.id === adjustBuildingId)
    if (!building?.footprint) return

    building.footprint.points = originalFootprint.map(p => ({
      lat: p.lat + deltaLat,
      lng: p.lng + deltaLng,
    }))
    docStore!.commit()
  },

  onPointerUp(event: ToolPointerEvent, ctx: ToolContext): void {
    if (!dragging || !dragStart || !adjustBuildingId || !originalFootprint) return

    const deltaLat = event.lat - dragStart.lat
    const deltaLng = event.lng - dragStart.lng

    const newPoints = originalFootprint.map(p => ({
      lat: p.lat + deltaLat,
      lng: p.lng + deltaLng,
    }))

    const dispatcher = ctx.services.dispatcher
    if (dispatcher) {
      dispatcher.execute({
        id: 'entity.update',
        label: 'Adjust Building Position',
        payload: {
          entityId: adjustBuildingId,
          changes: { footprint: { points: newPoints } },
        },
      })
    }

    dragging = false
    dragStart = null
    adjustBuildingId = null
    originalFootprint = null
  },

  onKeyDown(event: KeyboardEvent, ctx: ToolContext): void {
    if (event.key === 'Escape' && (dragging || adjustBuildingId)) {
      if (adjustBuildingId && originalFootprint) {
        const docStore = ctx.services.documentStore
        const doc = docStore?.document
        if (doc) {
          const building = doc.buildings.find(b => b.id === adjustBuildingId)
          if (building?.footprint) {
            building.footprint.points = originalFootprint
            docStore!.commit()
          }
        }
      }
      const toolReg = ctx.services.toolRegistry
      toolReg?.deactivate(ctx)
    }
  },
}

function pointInPolygon(lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat
    const xj = polygon[j].lng, yj = polygon[j].lat
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}
