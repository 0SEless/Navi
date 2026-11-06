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
  const clamp = { calls: [] as boolean[] }
  return {
    eased, pan, canvas, camera, clamp,
    setCenterClampedToGround(on: boolean) { clamp.calls.push(on) },
    elevations: [] as number[],
    jumped: [] as Array<Record<string, unknown>>,
    jumpTo(options: Record<string, unknown>) {
      (this as { jumped: Array<Record<string, unknown>> }).jumped.push(options)
      if (typeof options.pitch === 'number') camera.pitch = options.pitch
    },
    setCenterElevation(elevation: number) { (this as { elevations: number[] }).elevations.push(elevation) },
    getCenterClampedToGround: () => clamp.calls.at(-1) ?? true,
    on(type: string, fn: (event: unknown) => void) { handlers.set(type, [...(handlers.get(type) ?? []), fn]) },
    off(type: string, fn: (event: unknown) => void) { handlers.set(type, (handlers.get(type) ?? []).filter((f) => f !== fn)) },
    once(type: string, fn: (event: unknown) => void) {
      const wrapped = (event: unknown) => { handlers.set(type, (handlers.get(type) ?? []).filter((f) => f !== wrapped)); fn(event) }
      handlers.set(type, [...(handlers.get(type) ?? []), wrapped])
    },
    fire(type: string, event: Record<string, unknown> = {}) {
      const full = { point: { x: 100, y: 100 }, originalEvent: { button: 0, shiftKey: false }, preventDefault() {}, ...event }
      for (const fn of handlers.get(type) ?? []) fn(full)
    },
    getContainer: () => container,
    getCanvas: () => canvas,
    // 1 px = 1e-5° with the grid origin at the top-left corner (projectAtHeight falls back to this).
    project: ([lng, lat]: [number, number]) => ({ x: (lng - 122.1) * 1e5, y: (11.8 - lat) * 1e5 }),
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
    expect(map.eased[0].zoom as number).toBeLessThanOrEqual(18.5)
    // The aim height must stick: MapLibre's ground clamp would put it back at sea level (inside the hill).
    expect(map.clamp.calls).toEqual([false])
    expect(map.pan.enabled).toBe(false)
    expect(map.canvas.style.cursor).toBe('ns-resize')
    act(() => { shiftZ() })
    expect(onActive).toHaveBeenLastCalledWith(false)
    expect(map.eased[1]).toMatchObject({ center: { lng: 122.1, lat: 11.8 }, zoom: 17, bearing: 10, pitch: 0 })
    expect(map.pan.enabled).toBe(true)
    expect(map.canvas.style.cursor).toBe('')
    expect(map.clamp.calls).toEqual([false, true])
  })

  it('when the turn has arrived, it aims at the middle of the building (MapLibre drops the aim mid-tilt)', () => {
    const { map } = setup()
    act(() => { shiftZ() })
    act(() => map.fire('moveend'))
    expect(map.elevations).toEqual([13.75])
    act(() => map.fire('moveend'))
    expect(map.elevations).toEqual([13.75]) // once only
  })

  it('a turn cut short (MapLibre under load) jumps straight to the side view, then aims', () => {
    const { map } = setup()
    act(() => { shiftZ() })
    map.camera.pitch = 13 // the ease stopped part-way
    act(() => map.fire('moveend'))
    expect(map.jumped[0]).toMatchObject({ pitch: 75 })
    expect(map.elevations).toEqual([13.75])
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

describe('HeightEditMode for stairs (offset keeps following; floor ends step)', () => {
  function stairDoc(): CampusDocument {
    const d = doc()
    ;(d.buildings[0] as unknown as { floors: unknown[] }).floors = [
      { id: 'f1', elevation: 0, height: 3.5 }, { id: 'f2', elevation: 3.5, height: 3.5 }, { id: 'f3', elevation: 7, height: 3.5 },
    ]
    d.structures = [{
      id: 's1', form: 'stairs', presetId: 'plain-stair', width: 1.5, underneath: 'open', railings: 'both',
      start: { kind: 'slab', buildingId: 'hall', floorId: 'f2', edgeIndex: 0, edgeT: 0.5 },
      end: { kind: 'ground', position: ll(20, -20) },
    }]
    return d
  }

  function setupStair() {
    const map = fakeMap()
    const d = stairDoc()
    const dispatch = vi.fn((_command: Command) => ({ success: true }))
    const onDraft = vi.fn()
    const lock = vi.fn(async () => true)
    render(
      <HeightEditMode
        map={map as never} document={d} sampler={createTerrainSampler(d)} target={{ kind: 'stair', structureId: 's1' }}
        dispatch={dispatch} onDraft={onDraft} onActive={() => {}} ensureBuildingLock={lock}
      />,
    )
    return { map, dispatch, onDraft, lock }
  }

  it('Shift+Z looks across the stair run (side view)', () => {
    const { map } = setupStair()
    act(() => { shiftZ() })
    expect(map.eased[0]).toMatchObject({ pitch: 75 })
    // The stair runs north-south: the camera faces east or west.
    expect([90, 270]).toContain(Math.round(map.eased[0].bearing as number))
  })

  it('the ground end nearest the cursor gets an offset above the ground: live, one command, no lock', async () => {
    const { map, dispatch, onDraft, lock } = setupStair()
    act(() => { shiftZ() })
    // The ground end is at about (18, 18) on screen, the slab start at about (18, 0).
    act(() => map.fire('mousedown', { point: { x: 18, y: 17 } }))
    act(() => map.fire('mousemove', { point: { x: 18, y: 15 } }))
    const live = (onDraft.mock.calls.at(-1)?.[0] as { structure: { heightOffset: { end: number } } }).structure
    expect(live.heightOffset.end).toBeGreaterThan(0)
    expect(screen.getByRole('status').textContent).toMatch(/^End \+\d+\.\d m above the ground$/)
    act(() => map.fire('mouseup', { point: { x: 18, y: 15 } }))
    await flush()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0]).toMatchObject({ id: 'structure.replace', payload: { structure: { id: 's1', heightOffset: { end: live.heightOffset.end } } } })
    expect((dispatch.mock.calls[0][0].payload.structure as { end: unknown }).end).toEqual({ kind: 'ground', position: ll(20, -20) })
    expect(lock).not.toHaveBeenCalled()
  })

  it('a floor end steps floor to floor instead of a free height', async () => {
    const { map, dispatch } = setupStair()
    act(() => { shiftZ() })
    act(() => map.fire('mousedown', { point: { x: 18, y: 1 } }))
    act(() => map.fire('mousemove', { point: { x: 18, y: -9 } }))
    expect(screen.getByRole('status').textContent).toBe('Start · f3')
    act(() => map.fire('mouseup', { point: { x: 18, y: -9 } }))
    await flush()
    const next = dispatch.mock.calls[0][0].payload.structure as { start: { floorId: string }; heightOffset?: unknown }
    expect(next.start.floorId).toBe('f3')
    expect(next.heightOffset).toBeUndefined()
  })
})

