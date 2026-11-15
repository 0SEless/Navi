import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { toLatLng, type CampusDocument, type Road } from '@navi/core'
import { GradeTool } from '../tools/GradeTool'

afterEach(cleanup)
const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const sampler = { grid, groundAt: () => 2, heightAt: () => 2, sculptedAt: () => 2, baseAt: () => 2, changeAt: () => 0, fitAt: () => 0 }
const road = (extra: Partial<Road> = {}) => ({ id: 'r1', name: 'Gate road', polyline: { points: [ll(0, 0), ll(40, 0)] }, width: 6, type: 'connector', surface: 'asphalt', metadata: {}, ...extra }) as unknown as Road
const doc = (r: Road) => ({ terrain: { grid }, roads: [r], buildings: [] }) as unknown as CampusDocument
const map = { on: vi.fn(), off: vi.fn() }

function setup(r = road()) {
  const dispatch = vi.fn(() => ({ success: true }))
  render(<GradeTool map={map as never} document={doc(r)} sampler={sampler as never} active dispatch={dispatch as never} requestedRoadId="r1" />)
  return dispatch
}
const last = (d: ReturnType<typeof vi.fn>) => (d.mock.calls.at(-1) as unknown as [{ id: string; payload: Record<string, unknown> }])[0]

describe('Grade tool', () => {
  it('shows the road\'s grading controls', () => {
    setup()
    expect(screen.getByText('Gate road')).toBeTruthy()
    expect(screen.getByLabelText('Grade ground')).toBeTruthy()
    expect(screen.getByLabelText('Edge width (m)')).toBeTruthy()
    expect(screen.getByLabelText('Smooth ↔ Follow hill')).toBeTruthy()
  })

  it('turning grading on sets Raise and lower with a medium smoothness', () => {
    const d = setup()
    fireEvent.change(screen.getByLabelText('Grade ground'), { target: { value: 'both' } })
    expect(last(d)).toEqual(expect.objectContaining({ id: 'road.set-grade', payload: { roadId: 'r1', groundFit: { mode: 'both', blendMeters: 3 }, grade: { smoothness: 0.5 } } }))
  })

  it('the slider and Off change only what they control', () => {
    const d = setup(road({ groundFit: { mode: 'both', blendMeters: 3 }, grade: { smoothness: 0.5 } }))
    fireEvent.change(screen.getByLabelText('Smooth ↔ Follow hill'), { target: { value: '0.9' } })
    expect(last(d).payload).toEqual({ roadId: 'r1', grade: { smoothness: 0.9 } })
    fireEvent.change(screen.getByLabelText('Grade ground'), { target: { value: 'off' } })
    expect(last(d).payload).toEqual({ roadId: 'r1', groundFit: { mode: 'off', blendMeters: 3 } })
  })

  it('adds and removes pins', () => {
    const d = setup(road({ groundFit: { mode: 'both', blendMeters: 3 }, grade: { smoothness: 0.5, pins: [{ alongM: 10, heightM: 4 }] } }))
    fireEvent.click(screen.getByRole('button', { name: 'Add pin' }))
    const added = last(d).payload.grade as { pins: Array<{ alongM: number; heightM: number }> }
    expect(added.pins).toHaveLength(2)
    expect(added.pins.map((p) => p.alongM)).toEqual([10, 25])
    fireEvent.click(screen.getByRole('button', { name: 'Remove pin at 10 m' }))
    expect((last(d).payload.grade as { pins: unknown[] }).pins).toEqual([])
  })
  it('a new pin sits on the smooth road line, not on a bump in the ground', () => {
    // A 3 m bump at 19–21 m; "Raise only" leaves it in the surface, so the surface there is 5 m.
    const bumpy = (x: number) => (x > 19 && x < 21 ? 5 : 2)
    const s = { ...sampler, groundAt: (x: number) => bumpy(x), heightAt: (x: number) => bumpy(x) }
    const dispatch = vi.fn(() => ({ success: true }))
    render(<GradeTool map={map as never} document={doc(road({ groundFit: { mode: 'raise', blendMeters: 3 }, grade: { smoothness: 1 } }))} sampler={s as never} active dispatch={dispatch as never} requestedRoadId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add pin' }))
    const pin = (last(dispatch).payload.grade as { pins: Array<{ alongM: number; heightM: number }> }).pins[0]
    expect(pin.alongM).toBeCloseTo(20, 0)
    expect(pin.heightM).toBeLessThan(2.6)
  })

  it('Raise only and Lower only warn that the road will not be flat', () => {
    setup(road({ groundFit: { mode: 'raise', blendMeters: 3 }, grade: { smoothness: 0.5 } }))
    expect(screen.getByText(/Ground higher than the road stays/)).toBeTruthy()
    cleanup()
    setup(road({ groundFit: { mode: 'both', blendMeters: 3 }, grade: { smoothness: 0.5 } }))
    expect(screen.queryByText(/stays/)).toBeNull()
  })

  it('Remove all pins clears them in one step', () => {
    const d = setup(road({ groundFit: { mode: 'both', blendMeters: 3 }, grade: { smoothness: 0.5, pins: [{ alongM: 10, heightM: 4 }, { alongM: 20, heightM: 5 }] } }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove all pins' }))
    expect(last(d).payload).toEqual({ roadId: 'r1', grade: { smoothness: 0.5, pins: [] } })
  })
})

describe('Grade tool: placing pins where you want (owner 2026-11-15)', () => {
  function fakeMap() {
    const sources = new Map<string, { data: unknown; setData: (d: unknown) => void }>()
    const layers = new Map<string, unknown>()
    return {
      sources, layers, on: vi.fn(), off: vi.fn(),
      getLayer: (id: string) => layers.get(id), getSource: (id: string) => sources.get(id),
      addSource(id: string, spec: { data: unknown }) { sources.set(id, { data: spec.data, setData(d) { this.data = d } }) },
      addLayer(layer: { id: string }) { layers.set(layer.id, layer) },
      removeLayer: (id: string) => layers.delete(id), removeSource: (id: string) => sources.delete(id),
    }
  }
  const graded = (pins: Array<{ alongM: number; heightM: number }> = []) => road({ groundFit: { mode: 'both', blendMeters: 3 }, grade: { smoothness: 0.5, pins } })
  function open(r: Road) {
    const m = fakeMap()
    const dispatch = vi.fn(() => ({ success: true }))
    render(<GradeTool map={m as never} document={doc(r)} sampler={sampler as never} active dispatch={dispatch as never} requestedRoadId="r1" />)
    const click = (m.on.mock.calls.find((c) => c[0] === 'click') as unknown as [string, (e: unknown) => void])[1]
    return { m, dispatch, click }
  }

  it('clicking the selected road places a pin exactly there', () => {
    const { dispatch, click } = open(graded())
    act(() => click({ lngLat: ll(12, 1) }))
    const pins = (last(dispatch).payload.grade as { pins: Array<{ alongM: number; heightM: number }> }).pins
    expect(pins).toEqual([{ alongM: 12, heightM: 2 }])
  })

  it('the pins show on the map with their distance and height', () => {
    const { m } = open(graded([{ alongM: 10, heightM: 4 }, { alongM: 30, heightM: 5 }]))
    const data = m.sources.get('grade-pins')!.data as GeoJSON.FeatureCollection
    expect(data.features.map((f) => f.properties!.label)).toEqual(['10 m · 4 m', '30 m · 5 m'])
  })

  it('a pin can be moved along the road by typing where it goes', () => {
    const { dispatch } = open(graded([{ alongM: 10, heightM: 4 }]))
    fireEvent.change(screen.getByLabelText('Pin position (m) for pin 1'), { target: { value: '33' } })
    expect((last(dispatch).payload.grade as { pins: unknown[] }).pins).toEqual([{ alongM: 33, heightM: 4 }])
    fireEvent.change(screen.getByLabelText('Pin position (m) for pin 1'), { target: { value: '99' } })
    expect((last(dispatch).payload.grade as { pins: unknown[] }).pins).toEqual([{ alongM: 40, heightM: 4 }])
  })

  it('Edge width has a slider', () => {
    const { dispatch } = open(graded())
    fireEvent.change(screen.getByRole('slider', { name: 'Edge width slider' }), { target: { value: '6' } })
    expect(last(dispatch).payload).toEqual({ roadId: 'r1', groundFit: { mode: 'both', blendMeters: 6 } })
  })
  it('with many pins the side view stays above the pin list, and the list scrolls on its own', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ alongM: 1 + i * 2.5, heightM: 2 }))
    open(graded(many))
    const side = screen.getByLabelText('Side view · road')
    const list = screen.getByRole('group', { name: 'Pins' })
    expect(side.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(list.style.overflowY).toBe('auto')
    expect(list.style.maxHeight).not.toBe('')
  })
})
