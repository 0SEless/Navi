import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// Owner decision (2026-11-02, R70): warnings must not block publishing; errors still do.
const publish = vi.fn(async () => undefined)
let lastValidation: { passed: number; failed: number; errors: string[]; timestamp: number } | null = null

vi.mock('@navi/editor', () => ({
  useEditor: () => ({
    services: {
      get: (id: string) => (id === 'publish' ? { publish, getSnapshot: () => ({ publishState: 'idle', publishError: null }), subscribe: () => () => {} } : undefined),
    },
  }),
  useWorkflow: () => ({
    steps: { validation: { status: lastValidation === null ? 'pending' : lastValidation.failed > 0 ? 'error' : 'success' } },
    percent: 0,
    validate: vi.fn(),
    snapshot: { lastValidation },
  }),
}))

import { BuildStatus } from '../BuildStatus'

afterEach(() => {
  publish.mockClear()
  vi.restoreAllMocks()
  lastValidation = null
})

describe('BuildStatus publish gate (R70)', () => {
  it('allows Publish with warnings only, after a confirmation', () => {
    lastValidation = { passed: 10, failed: 1, errors: [], timestamp: 1 }
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<BuildStatus />)
    expect(screen.getByText('Ready with warnings')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Publish' })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('1 warning'))
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('does not publish when the warning confirmation is declined', () => {
    lastValidation = { passed: 10, failed: 2, errors: [], timestamp: 1 }
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<BuildStatus />)
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(publish).not.toHaveBeenCalled()
  })

  it('still blocks Publish while there are errors', () => {
    lastValidation = { passed: 10, failed: 2, errors: ['Entrance has no outdoor route'], timestamp: 1 }
    render(<BuildStatus />)
    expect(screen.getByText('Issues Found')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
  })

  it('publishes without asking when validation passed cleanly', () => {
    lastValidation = { passed: 10, failed: 0, errors: [], timestamp: 1 }
    const confirm = vi.spyOn(window, 'confirm')
    render(<BuildStatus />)
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(publish).toHaveBeenCalledTimes(1)
  })
})
