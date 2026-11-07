import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type maplibregl from 'maplibre-gl'
import {
  createTerrainSampler,
  toLatLng,
  type BrushSettings,
  type CampusDocument,
  type TerrainGrid,
  type TerrainSampler,
} from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'
import { useTerrainStroke } from '../useTerrainStroke'

// T4 error path: force stroke.dab to throw so the hook's guard is exercised (the real stroke is created inside the hook
// by the mocked createTerrainStroke, so only its dab is fault-injectable).
const strokeFaults = vi.hoisted(() => ({ dab: false }))

vi.mock('@/lib/terrain/terrain-stroke', async () => {
  const actual = await vi.importActual<typeof import('@/lib/terrain/terrain-stroke')>('@/lib/terrain/terrain-stroke')
  return {
    ...actual,
    createTerrainStroke: (...args: Parameters<typeof actual.createTerrainStroke>) => {
      const stroke = actual.createTerrainStroke(...args)
      if (!stroke) return stroke
      return {
        ...stroke,
        dab: (p: Parameters<typeof stroke.dab>[0], stepM?: number) => {
          if (strokeFaults.dab) throw new Error('sampler exploded')
          return stroke.dab(p, stepM)
        },
      }
    },
  }
})

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => {
  const p = toLatLng(grid, { x, y })
  return { lat: p.lat, lng: p.lng }
}
const settings: BrushSettings = { shape: 'circle', rotationDeg: 0, sizeM: 6, aspect: 1, profile: 'hard', strength: 1, mode: 'raise' }

function doc(): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: {}, buildings: [], roads: [], panoramas: [], qrCheckpoints: [],
    boundary: { points: [ll(20, 20), ll(100, 20), ll(100, 80), ll(20, 80)] },
    terrain: { reference: { name: 'T', zeroMeaning: 'z' }, grid, colorRange: { minM: 0, maxM: 40 } },
  } as unknown as CampusDocument
}

interface MockMapEvent {
  lngLat: { lat: number; lng: number }
  originalEvent: { button: number; altKey: boolean; shiftKey: boolean }
  preventDefault(): void
}

interface MiniMap {
  on(type: string, fn: (event: unknown) => void): void
  off(type: string, fn: (event: unknown) => void): void
  fire(type: string, event?: Partial<MockMapEvent>): void
  dragPan: { disable(): void; enable(): void }
  panState: { disabled: number; enabled: number }
  layers: string[]
}

function fakeMap(): maplibregl.Map & MiniMap {
  const handlers = new Map<string, Array<(event: unknown) => void>>()
  const layers: string[] = []
  const state = { disabled: 0, enabled: 0 }
  const map = {
    on: (type: string, fn: (event: unknown) => void) => {
      handlers.set(type, (handlers.get(type) ?? []).concat(fn))
    },
    off: (type: string, fn: (event: unknown) => void) => {
      handlers.set(type, (handlers.get(type) ?? []).filter((f) => f !== fn))
    },
    fire: (type: string, event?: Partial<MockMapEvent>) => {
      const full: MockMapEvent = {
        lngLat: event?.lngLat ?? ll(40, 40),
        originalEvent: { button: event?.originalEvent?.button ?? 0, altKey: event?.originalEvent?.altKey ?? false, shiftKey: event?.originalEvent?.shiftKey ?? false },
        preventDefault: () => {},
      }
      for (const fn of [...(handlers.get(type) ?? [])]) fn(full)
    },
    isStyleLoaded: () => true,
    getSource: () => ({ setData: vi.fn() }),
    addSource: vi.fn(),
    addLayer: (layer: { id: string }) => layers.push(layer.id),
    getLayer: (id: string) => (layers.includes(id) ? {} : undefined),
    getCanvas: () => ({ clientWidth: 400, clientHeight: 300 }),
    dragPan: {
      disable: () => state.disabled++,
      enable: () => state.enabled++,
    },
  } as unknown as maplibregl.Map & MiniMap
  map.panState = state
  map.layers = layers
  return map
}

function strokeHarness(dispatch: (command: Command) => MutationResult | undefined, sampler: TerrainSampler | null, onDabOverride?: () => void) {
  const counts = { start: 0, dab: 0, end: 0, cancel: 0, pick: 0 }
  const order: string[] = []
  let startedTiles: Map<`${number}_${number}`, Int16Array> | null = null
  const map = fakeMap()
  const Hook = () => {
    useTerrainStroke(map, {
      document: doc(),
      sampler,
      tool: 'raise-lower',
      settings,
      enabled: true,
      dispatch: (command) => {
        order.push('dispatch')
        return dispatch(command)
      },
      onStrokeStart: (tiles) => {
        order.push('start')
        counts.start++
        startedTiles = tiles
      },
      onDab: onDabOverride
        ?? (() => {
          order.push('dab')
          counts.dab++
        }),
      onStrokeEnd: () => {
        order.push('end')
        counts.end++
      },
      onStrokeCancel: () => {
        order.push('cancel')
        counts.cancel++
      },
      onPick: () => {
        order.push('pick')
        counts.pick++
      },
    })
    return null
  }
  render(<Hook />)
  return { map, counts, order, tilesRef: () => startedTiles }
}

const ok = (): MutationResult => ({ success: true })

describe('useTerrainStroke (paint preview wiring)', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('one stroke paints once per frame (holding adds a step every frame; a move is walked on the next frame), dispatches once', () => {
    vi.useFakeTimers()
    const dispatch = vi.fn(ok)
    const h = strokeHarness(dispatch, null)
    h.map.fire('mousedown', { lngLat: ll(40, 40) })
    expect(h.counts.start).toBe(1)
    expect(h.counts.dab).toBe(1)
    expect(h.tilesRef()).not.toBeNull()
    vi.advanceTimersByTime(160) // about ten frames of holding
    const held = h.counts.dab
    expect(held).toBeGreaterThanOrEqual(9)
    expect(held).toBeLessThanOrEqual(12)
    h.map.fire('mousemove', { lngLat: ll(45, 40) }) // a move only records the pointer…
    expect(h.counts.dab).toBe(held)
    vi.advanceTimersByTime(16) // …the next frame paints it
    expect(h.counts.dab).toBe(held + 1)
    h.map.fire('mouseup')
    expect(dispatch).toHaveBeenCalledTimes(1)
    const dispatched = dispatch.mock.calls as unknown as [Command][]
    expect(dispatched[0]?.[0].id).toBe('terrain.apply-tiles')
    expect(h.counts.end).toBe(1)
    expect(h.counts.cancel).toBe(0)
    expect(h.order.slice(-2)).toEqual(['dispatch', 'end'])
  })

  it('holding 1 s at full strength raises the centre by about 0.5625 × the brush size (after the first dab)', () => {
    vi.useFakeTimers()
    const h = strokeHarness(vi.fn(ok), null)
    h.map.fire('mousedown', { lngLat: ll(40, 40) })
    vi.advanceTimersByTime(1000)
    const centreCm = h.tilesRef()!.get('0_0')![40 * 128 + 40]
    // first dab 0.045 × 6 m = 0.27 m, then 1 s × 0.5625 × 6 m = 3.375 m; heights are stored in whole cm per dab,
    // so ~62 frames of 5.4 cm land as 5 cm each (≈ 3.37 m total) — within 10 % of the exact rate.
    expect(centreCm).toBeGreaterThan(364 * 0.9)
    expect(centreCm).toBeLessThan(364 * 1.05)
    h.map.fire('mouseup')
  })

  it('one quick pass raises a spot by a few dabs of 4.5 % of the brush size', () => {
    vi.useFakeTimers()
    const h = strokeHarness(vi.fn(ok), null)
    h.map.fire('mousedown', { lngLat: ll(30, 40) })
    h.map.fire('mousemove', { lngLat: ll(50, 40) })
    vi.advanceTimersByTime(16) // one frame walks the 20 m in 1.5 m steps
    h.map.fire('mouseup')
    const spotCm = h.tilesRef()!.get('0_0')![40 * 128 + 40]
    // A 6 m hard brush covers (40, 40) from dabs within 3 m: 4 dabs × 27 cm.
    expect(spotCm).toBeGreaterThanOrEqual(3 * 27)
    expect(spotCm).toBeLessThanOrEqual(5 * 27)
  })

  it('a failed dispatch cancels the stroke instead of handing the preview off', () => {
    vi.useFakeTimers()
    const dispatch = vi.fn(() => ({ success: false, error: 'locked' }) as MutationResult)
    const h = strokeHarness(dispatch, null)
    h.map.fire('mousedown', { lngLat: ll(40, 40) })
    h.map.fire('mouseup')
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(h.counts.end).toBe(0)
    expect(h.counts.cancel).toBe(1)
  })

  it('a stroke that changes nothing dispatches no command and cancels (empty preview cleaned)', () => {
    const dispatch = vi.fn(ok)
    const h = strokeHarness(dispatch, null)
    h.map.fire('mousedown', { lngLat: ll(500, 500), originalEvent: { button: 0, altKey: false, shiftKey: false } })
    h.map.fire('mouseup')
    expect(dispatch).not.toHaveBeenCalled()
    expect(h.counts.end).toBe(0)
    expect(h.counts.cancel).toBe(1)
    expect(h.counts.start).toBe(1)
  })

  it('mouseout finishes the stroke like mouseup', () => {
    vi.useFakeTimers()
    const dispatch = vi.fn(ok)
    const h = strokeHarness(dispatch, null)
    h.map.fire('mousedown', { lngLat: ll(40, 40) })
    h.map.fire('mouseout')
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(h.counts.end).toBe(1)
    expect(h.order.slice(-2)).toEqual(['dispatch', 'end'])
  })

  it('Alt+click with a brush picks the height under the point and never starts a stroke', () => {
    const sampler = createTerrainSampler(doc(), {})
    const dispatch = vi.fn(ok)
    const h = strokeHarness(dispatch, sampler)
    h.map.fire('mousedown', { lngLat: ll(40, 40), originalEvent: { button: 0, altKey: true, shiftKey: false } })
    expect(h.counts.pick).toBe(1)
    expect(h.counts.start).toBe(0)
    expect(h.counts.end).toBe(0)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('Esc during a stroke cancels it: no dispatch, no end, dragPan back, the stroke is dead', () => {
    vi.useFakeTimers()
    const dispatch = vi.fn(ok)
    const h = strokeHarness(dispatch, null)
    h.map.fire('mousedown', { lngLat: ll(40, 40) })
    expect(h.counts.start).toBe(1)
    expect(h.counts.dab).toBe(1)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(h.counts.cancel).toBe(1)
    expect(h.counts.end).toBe(0)
    expect(dispatch).not.toHaveBeenCalled()
    expect(h.map.panState.enabled).toBe(1)
    // The stroke is dead: no frame paints and a late mouseup has nothing to commit.
    vi.advanceTimersByTime(240)
    h.map.fire('mousemove', { lngLat: ll(50, 40) })
    expect(h.counts.dab).toBe(1)
    h.map.fire('mouseup')
    expect(dispatch).not.toHaveBeenCalled()
    expect(h.counts.end).toBe(0)
    expect(h.counts.cancel).toBe(1)
  })

  it('a throwing ground dab kills the stroke: cancel once, dragPan back, no dispatch', () => {
    vi.useFakeTimers()
    const dispatch = vi.fn(ok)
    strokeFaults.dab = true
    try {
      const h = strokeHarness(dispatch, null)
      h.map.fire('mousedown', { lngLat: ll(40, 40) })
      expect(h.counts.start).toBe(1)
      expect(h.counts.cancel).toBe(1)
      expect(h.counts.end).toBe(0)
      expect(dispatch).not.toHaveBeenCalled()
      expect(h.map.panState.enabled).toBe(1)
      h.map.fire('mousemove', { lngLat: ll(50, 40) })
      h.map.fire('mouseup')
      expect(h.counts.cancel).toBe(1)
      expect(h.counts.end).toBe(0)
      expect(dispatch).not.toHaveBeenCalled()
      expect(h.counts.dab).toBe(0)
    } finally {
      strokeFaults.dab = false
    }
  })

  it('a throwing preview update (onDab) kills the stroke the same way', () => {
    vi.useFakeTimers()
    const dispatch = vi.fn(ok)
    const h = strokeHarness(dispatch, null, () => {
      throw new Error('preview exploded')
    })
    h.map.fire('mousedown', { lngLat: ll(40, 40) })
    expect(h.counts.start).toBe(1)
    expect(h.counts.cancel).toBe(1)
    expect(h.counts.end).toBe(0)
    expect(dispatch).not.toHaveBeenCalled()
    expect(h.map.panState.enabled).toBe(1)
    h.map.fire('mousemove', { lngLat: ll(50, 40) })
    h.map.fire('mouseup')
    expect(h.counts.end).toBe(0)
    expect(h.counts.cancel).toBe(1)
  })
})
