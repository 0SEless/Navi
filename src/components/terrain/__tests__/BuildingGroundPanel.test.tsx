import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Building } from '@navi/core'
import { BuildingGroundPanel } from '../BuildingGroundPanel'

afterEach(cleanup)
const building = (ground?: unknown) => ({ id: 'b1', name: 'Library', baseElevation: 3, floors: [], ground }) as unknown as Building

function setup(ground?: unknown) {
  const onChange = vi.fn()
  render(<BuildingGroundPanel building={building(ground)} sampler={null} cutAboveFloorId={null} onChange={onChange} onCutAbove={vi.fn()} />)
  return onChange
}

describe('Ground around (banks and plinths, 2026-11-15)', () => {
  it('replaces Pad and Blend with Ground around and Bank slope', () => {
    setup({ baseMode: 'fixed', pad: { mode: 'both', blendMeters: 3 } })
    expect(screen.queryByLabelText('Pad mode')).toBeNull()
    expect(screen.queryByLabelText('Pad blend')).toBeNull()
    expect((screen.getByLabelText('Ground around') as HTMLSelectElement).value).toBe('bank')
    expect((screen.getByLabelText('Bank slope') as HTMLSelectElement).value).toBe('normal')
  })

  it('choosing sends the setting with the current floor mode', () => {
    const onChange = setup({ baseMode: 'follow-ground', pad: { mode: 'off', blendMeters: 3 } })
    fireEvent.change(screen.getByLabelText('Ground around'), { target: { value: 'slopes' } })
    expect(onChange).toHaveBeenLastCalledWith({ baseMode: 'follow-ground', around: 'slopes' })
    fireEvent.change(screen.getByLabelText('Bank slope'), { target: { value: 'steep' } })
    expect(onChange).toHaveBeenLastCalledWith({ baseMode: 'follow-ground', bankSlope: 'steep' })
  })

  it('Leave the hill hides Bank slope', () => {
    setup({ baseMode: 'fixed', pad: { mode: 'off', blendMeters: 3 }, around: 'leave' })
    expect(screen.queryByLabelText('Bank slope')).toBeNull()
  })
})
