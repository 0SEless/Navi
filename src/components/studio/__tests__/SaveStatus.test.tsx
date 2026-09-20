import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render } from '@testing-library/react'

const RAW_SYNC_ERROR =
  'The server has a different version of this map (2026-09-13T09:12:40.365798Z). Use reSync({ force: true }) or adoptServerSnapshot() to recover.'

const state = vi.hoisted(() => ({
  workflow: {
    snapshot: {
      saveState: 'dirty' as const,
      syncStatus: 'conflict' as const,
      saveError: null,
    },
  },
  graph: {
    syncStatus: 'conflict' as const,
    syncError: '',
    adoptServerSnapshot: vi.fn().mockResolvedValue(undefined),
    reSync: vi.fn().mockResolvedValue(undefined),
    syncLocalChanges: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@navi/editor', () => ({
  useWorkflow: () => state.workflow,
}))

vi.mock('@/store/graph-store', () => ({
  useGraphStore: (selector: (value: typeof state.graph) => unknown) => selector(state.graph),
}))

import { SaveStatus } from '../SaveStatus'

describe('SaveStatus conflict recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.workflow.snapshot = {
      saveState: 'dirty',
      syncStatus: 'conflict',
      saveError: null,
    }
    state.graph.syncStatus = 'conflict'
    state.graph.syncError = RAW_SYNC_ERROR
  })

  it('shows the administrator-facing conflict contract without raw implementation text', () => {
    const { getByText, getByRole, queryByText, queryByRole } = render(<SaveStatus />)

    expect(getByText('Changes not synced')).toBeInTheDocument()
    expect(
      getByText(
        'This device contains changes that could not be synchronized because the server version changed. Your local work is preserved.'
      )
    ).toBeInTheDocument()
    expect(getByRole('button', { name: 'Review conflict' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Re-sync' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Load server version' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Advanced recovery' })).toBeInTheDocument()
    expect(queryByText(RAW_SYNC_ERROR)).not.toBeInTheDocument()
    expect(queryByRole('button', { name: 'Force overwrite' })).not.toBeInTheDocument()
  })

  it('routes the visible Re-sync action to the safe local-change recovery path', () => {
    const { getByRole } = render(<SaveStatus />)

    fireEvent.click(getByRole('button', { name: 'Re-sync' }))

    expect(state.graph.syncLocalChanges).toHaveBeenCalledTimes(1)
    expect(state.graph.reSync).not.toHaveBeenCalled()
  })

  it('reveals the raw diagnostic and force overwrite only inside advanced recovery', () => {
    const { getByRole, getByText, queryByRole } = render(<SaveStatus />)

    expect(queryByRole('button', { name: 'Force overwrite' })).not.toBeInTheDocument()

    fireEvent.click(getByRole('button', { name: 'Advanced recovery' }))

    expect(getByRole('button', { name: 'Force overwrite' })).toBeInTheDocument()
    expect(getByText(RAW_SYNC_ERROR)).toBeInTheDocument()
  })

  it('does not force overwrite until its deliberate confirmation is clicked', () => {
    const { getByRole, queryByRole } = render(<SaveStatus />)

    fireEvent.click(getByRole('button', { name: 'Advanced recovery' }))
    fireEvent.click(getByRole('button', { name: 'Force overwrite' }))
    expect(state.graph.reSync).not.toHaveBeenCalled()
    expect(getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(getByRole('button', { name: 'Cancel' }))
    expect(queryByRole('dialog')).not.toBeInTheDocument()
    expect(state.graph.reSync).not.toHaveBeenCalled()

    fireEvent.click(getByRole('button', { name: 'Force overwrite' }))
    fireEvent.click(getByRole('button', { name: 'Confirm force overwrite' }))
    expect(state.graph.reSync).toHaveBeenCalledWith({ force: true })
  })

  it('uses the recoverable server-adoption action without invoking force', () => {
    const { getByRole } = render(<SaveStatus />)

    fireEvent.click(getByRole('button', { name: 'Load server version' }))

    expect(state.graph.adoptServerSnapshot).toHaveBeenCalledTimes(1)
    expect(state.graph.reSync).not.toHaveBeenCalled()
  })
})
