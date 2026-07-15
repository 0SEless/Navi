import { describe, it, expect } from 'vitest'
import { drawRoomTool } from './draw-room-tool'
import { drawHallwayTool } from './draw-hallway-tool'
import { selectTool } from './select-tool'
import { CoordinateTransformer } from '@navi/core'
import type { ToolContext, ToolPointerEvent } from './types'

function makeClick(x: number, y: number, lat: number, lng: number): ToolPointerEvent {
  return { x, y, lat, lng, button: 0, shiftKey: false, ctrlKey: false, altKey: false }
}

describe('drawRoomTool coordinate fix', () => {
  it('converts world lat/lng clicks to building-local meters (not screen pixels)', () => {
    const transformer = new CoordinateTransformer()
    transformer.registerBuilding({ buildingId: 'b1', origin: { lat: 11.001, lng: 125.0018 }, rotation: 0 })

    let executed: { payload?: { points?: { x: number; y: number }[] } } | null = null
    const ctx: ToolContext = {
      services: {
        viewport: { activeBuildingId: 'b1', activeFloorId: 'f0' },
        dispatcher: { execute: (cmd: unknown) => { executed = cmd as never } },
      } as never,
      transformer,
    } as ToolContext

    drawRoomTool.onActivate?.(ctx)
    drawRoomTool.onPointerDown(makeClick(100, 100, 11.001, 125.0018), ctx)
    drawRoomTool.onPointerDown(makeClick(200, 200, 11.001, 125.0019), ctx)
    drawRoomTool.onPointerDown(makeClick(300, 300, 11.0010005, 125.0018), ctx)
    drawRoomTool.onKeyDown?.({ key: 'Enter' } as KeyboardEvent, ctx)

    expect(executed).not.toBeNull()
    const points = executed!.payload!.points
    expect(points.length).toBe(3)
    for (const p of points) {
      expect(Math.abs(p.x)).toBeLessThan(100)
      expect(Math.abs(p.y)).toBeLessThan(100)
      expect([100, 200, 300]).not.toContain(p.x)
    }
    // Second point is ~0.0001° lng east of origin → ~10.9 m local x.
    expect(Math.abs(points[1].x - 10.9)).toBeLessThan(1)
  })
})

describe('drawHallwayTool coordinate fix', () => {
  it('converts world lat/lng clicks to building-local meters (not screen pixels)', () => {
    const transformer = new CoordinateTransformer()
    transformer.registerBuilding({ buildingId: 'b1', origin: { lat: 11.001, lng: 125.0018 }, rotation: 0 })

    let executed: { payload?: { points?: { x: number; y: number }[] } } | null = null
    const ctx: ToolContext = {
      services: {
        viewport: { activeBuildingId: 'b1', activeFloorId: 'f0' },
        dispatcher: { execute: (cmd: unknown) => { executed = cmd as never } },
      } as never,
      transformer,
    } as ToolContext

    drawHallwayTool.onActivate?.(ctx)
    drawHallwayTool.onPointerDown(makeClick(100, 100, 11.001, 125.0018), ctx)
    drawHallwayTool.onPointerDown(makeClick(250, 250, 11.001, 125.0020), ctx)
    drawHallwayTool.onKeyDown?.({ key: 'Enter' } as KeyboardEvent, ctx)

    expect(executed).not.toBeNull()
    const points = executed!.payload!.points
    expect(points.length).toBe(2)
    for (const p of points) {
      expect(Math.abs(p.x)).toBeLessThan(100)
      expect(Math.abs(p.y)).toBeLessThan(100)
      expect([100, 250]).not.toContain(p.x)
    }
  })
})

describe('selectTool hit-test', () => {
  function ctxWithMap(features: unknown[], legacy: { node?: string | null; trace?: string | null } = {}): ToolContext {
    const selected: unknown[] = []
    return {
      services: { selection: { select: (sel: unknown) => selected.push(sel) } } as never,
      map: { queryRenderedFeatures: () => features } as never,
      legacySelectNode: (id: string | null) => { legacy.node = id },
      legacySelectTrace: (id: string | null) => { legacy.trace = id },
    } as unknown as ToolContext
  }

  it('selects a building via SelectionManager', () => {
    const selected: any[] = []
    const ctx = ctxWithMap([{ layer: { id: 'l-buildings-fill' }, properties: { id: 'b1' } }])
    ;(ctx.services as any).selection.select = (s: any) => selected.push(s)
    selectTool.onPointerDown(makeClick(10, 10, 11, 125), ctx)
    expect(selected[0]).toEqual({ type: 'building', id: 'b1' })
  })

  it('routes a node hit to the legacy bridge', () => {
    const legacy: { node?: string | null } = {}
    const ctx = ctxWithMap([{ layer: { id: 'l-nodes' }, properties: { id: 'n1' } }], legacy)
    selectTool.onPointerDown(makeClick(10, 10, 11, 125), ctx)
    expect(legacy.node).toBe('n1')
  })

  it('selects an authored road via SelectionManager', () => {
    const selected: any[] = []
    const ctx = ctxWithMap([{ layer: { id: 'navi-road-line' }, properties: { id: 'road-1' } }])
    ;(ctx.services as any).selection.select = (s: any) => selected.push(s)
    selectTool.onPointerDown(makeClick(10, 10, 11, 125), ctx)
    expect(selected[0]).toEqual({ type: 'road', id: 'road-1' })
  })

  it('does not treat a compiled trace as a road entity', () => {
    const selected: any[] = []
    const legacy: { trace?: string | null } = {}
    const ctx = ctxWithMap([{ layer: { id: 'l-traces-line' }, properties: { id: 't1' } }], legacy)
    ;(ctx.services as any).selection.select = (s: any) => selected.push(s)
    selectTool.onPointerDown(makeClick(10, 10, 11, 125), ctx)
    expect(selected).toHaveLength(0)
    expect(legacy.trace).toBeNull()
  })

  it('prefers an authored road over an overlapping compiled graph node', () => {
    const selected: any[] = []
    const ctx = ctxWithMap([
      { layer: { id: 'l-nodes' }, properties: { id: 'N0031' } },
      { layer: { id: 'navi-road-line' }, properties: { id: 'road-1' } },
    ])
    ;(ctx.services as any).selection.select = (s: any) => selected.push(s)
    selectTool.onPointerDown(makeClick(10, 10, 11, 125), ctx)
    expect(selected[0]).toEqual({ type: 'road', id: 'road-1' })
  })

  it('clears legacy selection on empty click', () => {
    const legacy: { node?: string | null; trace?: string | null } = {}
    const ctx = ctxWithMap([], legacy)
    selectTool.onPointerDown(makeClick(10, 10, 11, 125), ctx)
    expect(legacy.node).toBeNull()
    expect(legacy.trace).toBeNull()
  })
})
