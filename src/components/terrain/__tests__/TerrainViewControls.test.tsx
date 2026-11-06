import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { TerrainViewControls } from '../TerrainViewControls'

afterEach(cleanup)

describe('TerrainViewControls', () => {
  it('one Colours switch: Off, Height, Changes (Off pressed when neutral)', () => {
    const onView = vi.fn()
    render(<TerrainViewControls view="neutral" exaggeration={1} onView={onView} onExaggeration={() => {}} />)
    const group = screen.getByRole('group', { name: 'Colours' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Off', 'Height', 'Changes'])
    expect(within(group).getByRole('button', { name: 'Off' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(group).getByRole('button', { name: 'Height' }))
    expect(onView).toHaveBeenCalledWith('heights')
    fireEvent.click(within(group).getByRole('button', { name: 'Changes' }))
    expect(onView).toHaveBeenCalledWith('changes')
    expect(screen.queryByRole('button', { name: 'Contours' })).toBeNull()
  })
})
