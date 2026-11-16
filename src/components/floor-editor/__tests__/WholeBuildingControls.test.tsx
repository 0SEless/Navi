import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WholeBuildingControls } from '../WholeBuildingLayer'

afterEach(cleanup)
const floors = [{ level: 1, label: 'Floor 2' }, { level: 2, label: 'Floor 3' }]

describe('WholeBuildingControls', () => {
  it('turns the whole-building view on and lists the floors above with show/hide', () => {
    const onToggle = vi.fn(), onToggleFloor = vi.fn()
    render(<WholeBuildingControls floorsAbove={floors} on hidden={new Set([2])} onToggle={onToggle} onToggleFloor={onToggleFloor} />)
    fireEvent.click(screen.getByLabelText('Whole building'))
    expect(onToggle).toHaveBeenCalledWith(false)
    expect((screen.getByLabelText('Show Floor 2') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Show Floor 3') as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByLabelText('Show Floor 3'))
    expect(onToggleFloor).toHaveBeenCalledWith(2)
  })

  it('says when there is no floor above', () => {
    render(<WholeBuildingControls floorsAbove={[]} on hidden={new Set()} onToggle={() => {}} onToggleFloor={() => {}} />)
    expect(screen.getByText('No floor above this one')).toBeTruthy()
  })
})
