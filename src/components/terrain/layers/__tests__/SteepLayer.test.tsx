import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SteepToggle } from '../SteepLayer'

afterEach(cleanup)

describe('Too steep toggle', () => {
  it('shows its state and flips it', () => {
    const onChange = vi.fn()
    const { rerender } = render(<SteepToggle on={false} onChange={onChange} />)
    const button = screen.getByRole('button', { name: 'Too steep' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    expect(onChange).toHaveBeenCalledWith(true)
    rerender(<SteepToggle on onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Too steep' }).getAttribute('aria-pressed')).toBe('true')
  })
})
