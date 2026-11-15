import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SetAsideWork } from '../SetAsideWork'

afterEach(cleanup)

describe('set-aside unsaved work', () => {
  it('shows when work was set aside, and Restore keeps current edits and reloads', async () => {
    const session = { setAsideSince: vi.fn(async () => '2026-11-14T19:24:12.172Z'), restoreOnNextOpen: vi.fn(async () => {}) }
    const reload = vi.fn()
    render(<SetAsideWork session={session as never} reload={reload} />)
    const button = await screen.findByRole('button', { name: 'Restore set-aside work' })
    expect(screen.getByText(/Unsaved work from/)).toBeTruthy()
    fireEvent.click(button)
    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(session.restoreOnNextOpen).toHaveBeenCalled()
  })

  it('shows nothing when nothing was set aside', async () => {
    const session = { setAsideSince: vi.fn(async () => null), restoreOnNextOpen: vi.fn() }
    const { container } = render(<SetAsideWork session={session as never} reload={vi.fn()} />)
    await waitFor(() => expect(session.setAsideSince).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})
