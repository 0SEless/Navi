import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { CampusDocument, ResolvedStructure, Structure } from '@navi/core'
import { StructurePanel } from '../StructurePanel'

// Owner 2026-11-15: stairs with flat landings, steepness, and landing heights you can raise by hand.
afterEach(cleanup)
const stair = (extra: Partial<Structure> = {}): Structure => ({
  id: 's1', form: 'stairs', presetId: 'plain-stair', width: 1.5, underneath: 'open', railings: 'both',
  start: { kind: 'ground', position: { lat: 0, lng: 0 } }, end: { kind: 'ground', position: { lat: 0, lng: 0.0001 } }, ...extra,
} as Structure)
const resolved: ResolvedStructure = { start: { x: 0, y: 0, h: 0 }, end: { x: 12, y: 0, h: 3 }, orphanStart: false, orphanEnd: false }

function setup(s: Structure) {
  const dispatch = vi.fn(() => ({ success: true }))
  render(<StructurePanel document={{ buildings: [], structures: [s] } as unknown as CampusDocument} structure={s} resolved={resolved} dispatch={dispatch as never} onDeleted={vi.fn()} />)
  return dispatch
}
const sent = (d: ReturnType<typeof vi.fn>) => ((d.mock.calls.at(-1) as unknown as [{ payload: { structure: Structure } }])[0]).payload.structure

describe('stair landings and steepness', () => {
  it('Steepness sets the stair’s step size', () => {
    const d = setup(stair())
    fireEvent.change(screen.getByLabelText('Steepness'), { target: { value: 'steep' } })
    expect(sent(d).steepness).toBe('steep')
  })

  it('stairs can add a landing (a flat area between flights)', () => {
    const d = setup(stair())
    fireEvent.click(screen.getByRole('button', { name: 'Add landing' }))
    expect(sent(d).landings).toEqual([0.5])
  })

  it('each landing: position, length and a height you can type (empty = automatic)', () => {
    const d = setup(stair({ landings: [0.5] }))
    fireEvent.change(screen.getByLabelText('Landing 1 position (m)'), { target: { value: '3' } })
    expect(sent(d).landings).toEqual([0.25])
    fireEvent.change(screen.getByLabelText('Landing 1 height (m)'), { target: { value: '2' } })
    expect(sent(d).landingHeightsM).toEqual([2])
    fireEvent.change(screen.getByLabelText('Landing length (m)'), { target: { value: '2' } })
    expect(sent(d).landingLengthM).toBe(2)
  })

  it('emptying a typed landing height makes it automatic again', () => {
    const d = setup(stair({ landings: [0.5], landingHeightsM: [2] }))
    fireEvent.change(screen.getByLabelText('Landing 1 height (m)'), { target: { value: '' } })
    expect(sent(d).landingHeightsM).toEqual([null])
  })

  it('removing a landing also removes its typed height', () => {
    const d = setup(stair({ landings: [0.3, 0.7], landingHeightsM: [1, null] }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove landing 1' }))
    expect(sent(d).landings).toEqual([0.7])
    expect(sent(d).landingHeightsM).toEqual([null])
  })

  it('shows the flights and steps of a stair with landings', () => {
    setup(stair({ landings: [0.5] }))
    expect(screen.getByLabelText('Stair readout').textContent).toMatch(/2 flights/)
  })
})
