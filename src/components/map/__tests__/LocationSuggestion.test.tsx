import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LocationSuggestion } from '../LocationSuggestion'

describe('LocationSuggestion', () => {
  it('asks for confirmation and reports either choice', () => {
    const onConfirm = vi.fn()
    const onReject = vi.fn()
    render(<LocationSuggestion label="East Gate" accuracyM={8.7} onConfirm={onConfirm} onReject={onReject} />)
    expect(screen.getByText('You seem to be near East Gate (±9 m). Is that right?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onReject).toHaveBeenCalledOnce()
  })
})
