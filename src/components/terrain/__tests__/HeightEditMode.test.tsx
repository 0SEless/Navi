import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createTerrainSampler, toLatLng, type Building, type CampusDocument } from '@navi/core'
import type { Command } from '@navi/editor'
import { HeightEditMode } from '../HeightEditMode'

afterEach(cleanup)

const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })

function doc(pad?: { mode: 'off' | 'raise' | 'lower' | 'both'; blendMeters: number }): CampusDocument {
  const hall = {
    id: 'hall', name: 'Hall', footprint: { points: [ll(0, 0), ll(40, 0), ll(40, 10), ll(0, 10), ll(0, 0)] },
    baseElevation: 12, floors: [{ id: 'f1', elevation: 0, height: 3.5 }],
    ...(pad ? { ground: { baseMode: 'fixed', pad } } : {}),
  } as unknown as Building
  return {
    schemaVersion: 1, version: 0, metadata: { campusId: 'c1' }, roads: [], panoramas: [], qrCheckpoints: [], buildings: [hall],
    terrain: { reference: { name: 'T', zeroMeaning: 'z' }, grid, colorRange: { minM: 0, maxM: 40 } },
  } as unknown as CampusDocument
}

function fakeMap() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const handlers = new Map<string, Array<(event: unknown) => void>>()
  const camera = { center: { lng: 122.1, lat: 11.8 }, zoom: 17, bearing: 10, pitch: 0 }
  const eased: Array<Record<string, unknown>> = []
  const pan = { enabled: true }
  const canvas = { style: { cursor: '' } }
  return {
    eased, pan, canvas, camera,
    on(type: string, fn: (event: unknown) => void) { handlers.set(type, [...(handlers.get(type) ?? []), fn]) },
    off(type: string, fn: (event: unknown) => void) { handlers.set(type, (handlers.get(type) ?? []).filter((f) => f !== fn)) },
    fire(type: string, event: Record<string, unknown> = {}) {
      const full = { point: { x: 100, y: 100 }, originalEvent: { button: 0, shiftKey: false }, preventDefault() {}, ...event }
      for (const fn of handlers.get(type) ?? []) fn(full)
    },
    getContainer: () => container,
    getCanvas: () => canvas,
    getCenter: () => camera.center,
    getZoom: () => camera.zoom,
    getBearing: () => camera.bearing,
    getPitch: () => camera.pitch,
    cameraForBounds: () => ({ center: { lng: 122.1002, lat: 11.80005 }, zoom: 18.5 }),
    easeTo(options: Record<string, unknown>) {
      eased.push(options)
      if (typeof options.pitch === 'number') camera.pitch = options.pitch
      if (typeof options.zoom === 'number') camera.zoom = options.zoom
    },
    dragPan: { disable() { pan.enabled = false }, enable() { pan.enabled = true } },
  }
}

function setup(opts: { target?: 'hall' | null; pad?: { mode: 'off' | 'raise' | 'lower' | 'both'; blendMeters: number }; lock?: boolean } = {}) {
  const map = fakeMap()
  const d = doc(opts.pad)
  const dispatch = vi.fn((_command: Command) => ({ success: true }))
  const onDraft = vi.fn()
  const onActive = vi.fn()
  const target = opts.target === null ? null : { kind: 'building' as const, buildingId: 'hall' }
  render(
    <HeightEditMode
      map={map as never} document={d} sampler={createTerrainSampler(d)} target={target}
      dispatch={dispatch} onDraft={onDraft} onActive={onActive}
      ensureBuildingLock={async () => opts.lock ?? true}
    />,
  )
  return { map, dispatch, onDraft, onActive }
}

const shiftZ = () => fireEvent.keyDown(window, { key: 'Z', shiftKey: true })
const esc = () => fireEvent.keyDown(window, { key: 'Escape' })
const flush = () => act(async () => {})

describe('HeightEditMode (Shift+Z)', () => {
  it('Shift+Z with a selected building turns to a side view and stops panning; Shift+Z again returns the camera', () => {
    const { map, onActive } = setup()
    act(() => { shiftZ() })
    expect(onActive).toHaveBeenLastCalledWith(true)
    expect(map.eased[0]).toMatchObject({ pitch: 75 })
    // Aimed at the middle of the building's height (base 12, one 3.5 m floor), not at sea level inside the hill.
    expect(map.eased[0].elevation).toBeCloseTo(13.75, 6)
    expect(map.eased[0].zoom as number).toBeLessThanOrEqual(18.5)
    expect(map.pan.enabled).toBe(false)
    expect(map.canvas.style.cursor).toBe('ns-resize')
    act(() => { shiftZ() })
    expect(onActive).toHaveBeenLastCalledWith(false)
    expect(map.eased[1]).toMatchObject({ center: { lng: 122.1, lat: 11.8 }, zoom: 17, bearing: 10, pitch: 0 })
    expect(map.pan.enabled).toBe(true)
    expect(map.canvas.style.cursor).toBe('')
  })

  it('nothing selected: a hint, no camera move', () => {
    const { map, onActive } = setup({ target: null })
    act(() => { shiftZ() })
    expect(screen.getByRole('status').textContent).toMatch(/select a building or a stair/i)
    expect(map.eased).toHaveLength(0)
    expect(onActive).not.toHaveBeenCalledWith(true)
  })

  it('one drag = one command: the base follows live, release sets Fixed and digs (pad off → lower)', async () => {
    const { map, dispatch, onDraft } = setup()
    act(() => { shiftZ() })
    act(() => map.fire('mousedown', { point: { x: 100, y: 100 } }))
    act(() => map.fire('mousemove', { point: { x: 100, y: 110 } }))
    act(() => map.fire('mousemove', { point: { x: 100, y: 120 } }))
    const live = onDraft.mock.calls.at(-1)?.[0] as { buildingBase: { buildingId: string; baseM: number } }
    expect(live.buildingBase.buildingId).toBe('hall')
    expect(live.buildingBase.baseM).toBeLessThan(12)
    expect(screen.getByRole('status').textContent).toMatch(/^Base \d+\.\d m \(−\d+\.\d\)$/)
    expect(dispatch).not.toHaveBeenCalled()
    act(() => map.fire('mouseup', { point: { x: 100, y: 120 } }))
    await flush()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      id: 'building.set-ground',
      payload: { buildingId: 'hall', baseMode: 'fixed', baseElevation: live.buildingBase.baseM, pad: { mode: 'lower', blendMeters: 3 } },
    })
    expect(onDraft).toHaveBeenLastCalledWith(null)
  })

  it('a "both" pad (the import default) becomes dig only and keeps its blend', async () => {
    const { map, dispatch } = setup({ pad: { mode: 'both', blendMeters: 6 } })
    act(() => { shiftZ() })
    act(() => map.fire('mousedown', { point: { x: 100, y: 100 } }))
    act(() => map.fire('mousemove', { point: { x: 100, y: 80 } }))
    act(() => map.fire('mouseup', { point: { x: 100, y: 80 } }))
    await flush()
    expect(dispatch.mock.calls[0][0].payload).toMatchObject({ pad: { mode: 'lower', blendMeters: 6 } })
  })

  it('Esc mid-drag puts it back: no command; the mode stays on', async () => {
    const { map, dispatch, onDraft, onActive } = setup()
    act(() => { shiftZ() })
    act(() => map.fire('mousedown', { point: { x: 100, y: 100 } }))
    act(() => map.fire('mousemove', { point: { x: 100, y: 130 } }))
    act(() => { esc() })
    act(() => map.fire('mouseup', { point: { x: 100, y: 130 } }))
    await flush()
    expect(dispatch).not.toHaveBeenCalled()
    expect(onDraft).toHaveBeenLastCalledWith(null)
    expect(onActive).toHaveBeenLastCalledWith(true)
  })

  it('a press without moving changes nothing; the building lock refused = a message, no command', async () => {
    const still = setup()
    act(() => { shiftZ() })
    act(() => still.map.fire('mousedown', { point: { x: 100, y: 100 } }))
    act(() => still.map.fire('mouseup', { point: { x: 100, y: 100 } }))
    await flush()
    expect(still.dispatch).not.toHaveBeenCalled()
    cleanup()

    const locked = setup({ lock: false })
    act(() => { shiftZ() })
    act(() => locked.map.fire('mousedown', { point: { x: 100, y: 100 } }))
    act(() => locked.map.fire('mousemove', { point: { x: 100, y: 140 } }))
    act(() => locked.map.fire('mouseup', { point: { x: 100, y: 140 } }))
    await flush()
    expect(locked.dispatch).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/another admin/i)
  })
})
