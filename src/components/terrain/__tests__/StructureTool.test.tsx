import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createTerrainSampler, toLatLng, toLocal, type CampusDocument, type Structure } from '@navi/core'
import type { Command } from '@navi/editor'
import { StructureTool } from '../tools/StructureTool'

afterEach(cleanup)

const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })

/** 1 px = 1e-5° (about 1.1 m) with the grid origin at the screen's top-left corner. */
function fakeMap() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const handlers = new Map<string, Array<(event: unknown) => void>>()
  return {
    on(type: string, fn: (event: unknown) => void) { handlers.set(type, [...(handlers.get(type) ?? []), fn]) },
    off(type: string, fn: (event: unknown) => void) { handlers.set(type, (handlers.get(type) ?? []).filter((f) => f !== fn)) },
    fire(type: string, event: unknown) { for (const fn of handlers.get(type) ?? []) fn(event) },
    getContainer: () => container,
    getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
    project: ([lng, lat]: [number, number]) => ({ x: (lng - 122.1) * 1e5, y: (11.8 - lat) * 1e5 }),
    unproject: ([x, y]: [number, number]) => ({ lng: 122.1 + x / 1e5, lat: 11.8 - y / 1e5 }),
  }
}

const stair: Structure = {
  id: 's1', form: 'stairs', presetId: 'plain-stair', width: 1.5, underneath: 'open', railings: 'both',
  start: { kind: 'ground', position: ll(10, -10) },
  end: { kind: 'ground', position: ll(40, -10) },
}

function doc(structures: Structure[], extra: Partial<CampusDocument> = {}): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: { campusId: 'c1' }, panoramas: [], qrCheckpoints: [],
    terrain: { reference: { name: 'Test', zeroMeaning: 'Sea level' }, grid, colorRange: { minM: 0, maxM: 40 } },
    buildings: [],
    // A road 50 px below the origin, from x 0 to 100 px.
    roads: [{ id: 'r1', polyline: { points: [{ lat: 11.8 - 50e-5, lng: 122.1 }, { lat: 11.8 - 50e-5, lng: 122.1 + 100e-5 }] } }],
    structures,
    ...extra,
  } as unknown as CampusDocument
}

function setup(d: CampusDocument, selectFirst = true) {
  const map = fakeMap()
  const dispatch = vi.fn((_command: Command) => ({ success: true }))
  const sampler = createTerrainSampler(d)!
  render(<StructureTool document={d} sampler={sampler} map={map as never} active dispatch={dispatch} />)
  // Click the middle of the stair to select it.
  if (selectFirst) act(() => map.fire('click', { lngLat: ll(25, -10) }))
  return { map, dispatch }
}

function drag(element: Element, points: Array<[number, number]>) {
  const [first, ...rest] = points
  fireEvent.pointerDown(element, { clientX: first[0], clientY: first[1], pointerId: 1 })
  for (const [x, y] of rest) fireEvent.pointerMove(element, { clientX: x, clientY: y, pointerId: 1 })
  const last = points[points.length - 1]
  fireEvent.pointerUp(element, { clientX: last[0], clientY: last[1], pointerId: 1 })
}

describe('Stairs tool', () => {
  it('a click on an empty spot places a 3 m block on the ground', () => {
    const { map, dispatch } = setup(doc([]), false)
    act(() => map.fire('click', { lngLat: ll(5, -5) }))
    const command = dispatch.mock.calls[0][0]
    expect(command.id).toBe('structure.create')
    const created = command.payload.structure as Structure
    expect(created).toMatchObject({ form: 'stairs', presetId: 'plain-stair', width: 1.5, start: { kind: 'ground' }, end: { kind: 'ground' } })
    const a = toLocal(grid, (created.start as { position: { lat: number; lng: number } }).position)
    const b = toLocal(grid, (created.end as { position: { lat: number; lng: number } }).position)
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(3, 3)
  })

  it('one drag = one command; the end snaps to a road within 14 px', () => {
    const { dispatch } = setup(doc([stair]))
    expect(dispatch).not.toHaveBeenCalled()
    drag(screen.getByLabelText('Stair end'), [[36, 9], [45, 20], [55, 40], [60, 45]])
    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = dispatch.mock.calls[0][0]
    expect(command.id).toBe('structure.replace')
    expect((command.payload.structure as Structure).end).toMatchObject({ kind: 'road', roadId: 'r1' })
    expect((command.payload.structure as Structure).start).toEqual(stair.start)
  })

  it('a press without moving changes nothing', () => {
    const { dispatch } = setup(doc([stair]))
    drag(screen.getByLabelText('Stair end'), [[36, 9], [36, 9]])
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('the bend handle sits on the curve: dropping it there sets the control point', () => {
    const { dispatch } = setup(doc([stair]))
    // Straight stair: the handle is at the middle. Drop it 10 px lower (south).
    const handle = screen.getByLabelText('Stair bend')
    const mid = { x: Number.parseFloat(handle.style.left), y: Number.parseFloat(handle.style.top) }
    drag(handle, [[mid.x, mid.y], [mid.x, mid.y + 10]])
    const bend = (dispatch.mock.calls[0][0].payload.structure as Structure).bend!
    const local = toLocal(grid, bend)
    const middle = toLocal(grid, { lat: 11.8 - (mid.y + 10) / 1e5, lng: 122.1 + mid.x / 1e5 })
    const s = toLocal(grid, (stair.start as { position: { lat: number; lng: number } }).position)
    const e = toLocal(grid, (stair.end as { position: { lat: number; lng: number } }).position)
    expect(local.x).toBeCloseTo(2 * middle.x - (s.x + e.x) / 2, 6)
    expect(local.y).toBeCloseTo(2 * middle.y - (s.y + e.y) / 2, 6)
  })

  it('deleted building → the start keeps its last height and shows the marker', () => {
    const orphan: Structure = {
      ...stair,
      start: { kind: 'slab', buildingId: 'gone', floorId: 'f3', edgeIndex: 0, edgeT: 0.5, last: { ...ll(10, -10), heightM: 7 } },
    }
    setup(doc([orphan]))
    expect(screen.getByLabelText('Stair start').getAttribute('data-orphan')).toBe('true')
    expect(screen.getByRole('status').textContent).toMatch(/building .* removed/i)
  })

  it('Swap preset keeps the ends (one swap command)', () => {
    const { dispatch } = setup(doc([stair]))
    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'hillside-stair' } })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0]).toMatchObject({ id: 'structure.swap-preset', payload: { id: 's1', preset: { id: 'hillside-stair' } } })
  })

  it('a stair too short on screen shows only its two end handles (on top)', () => {
    const short: Structure = { ...stair, end: { kind: 'ground', position: ll(13, -10) } }
    const map = fakeMap()
    const d = doc([short])
    render(<StructureTool document={d} sampler={createTerrainSampler(d)!} map={map as never} active dispatch={vi.fn(() => ({ success: true }))} />)
    act(() => map.fire('click', { lngLat: ll(11.5, -10) }))
    expect(screen.queryByLabelText('Stair bend')).toBeNull()
    expect(screen.queryByLabelText('Flight start')).toBeNull()
    const labels = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label')).filter((l) => l?.startsWith('Stair'))
    expect(labels).toEqual(['Stair start', 'Stair end'])
  })
})
