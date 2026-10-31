import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const RAW_SYNC_ERROR =
  'The server has a different version of this map (2026-09-13T09:12:40.365798Z). Use reSync({ force: true }) or adoptServerSnapshot() to recover.'

const state = vi.hoisted(() => ({
  workflow: {
    snapshot: {
      saveState: 'dirty' as 'dirty' | 'saved',
      saveError: null as string | null,
    },
  },
  graph: {
    syncStatus: 'conflict' as string,
    syncError: '' as string | null,
    localDraftStatus: 'idle' as string,
    localDraftError: null as string | null,
    scopedHistoryStatus: 'disabled' as string,
    scopedHistoryDetail: null as string | null,
    scopedHistoryEnabled: false,
    durableScopedSaveEnabled: false,
  },
}))

vi.mock('@navi/editor', () => ({
  useWorkflow: () => state.workflow,
}))

vi.mock('@/store/graph-store', () => ({
  isStudioLocalDraftModeEnabled: () => false,
  useGraphStore: (selector: (value: typeof state.graph) => unknown) => selector(state.graph),
}))

vi.mock('@/services/studio-scoped-history-flag', () => ({
  isStudioScopedHistoryEnabled: () => state.graph.scopedHistoryEnabled,
  isStudioDurableScopedSaveEnabled: () => state.graph.durableScopedSaveEnabled,
}))

import { SaveStatus } from '../SaveStatus'

describe('SaveStatus compact indicator (recovery actions moved to View Issues)', () => {
  beforeEach(() => {
    state.workflow.snapshot = { saveState: 'dirty', saveError: null }
    state.graph.syncStatus = 'conflict'
    state.graph.syncError = RAW_SYNC_ERROR
    state.graph.scopedHistoryStatus = 'disabled'
    state.graph.scopedHistoryDetail = null
    state.graph.scopedHistoryEnabled = false
    state.graph.durableScopedSaveEnabled = false
  })

  it('shows the administrator-facing conflict contract without raw implementation text or inline recovery buttons', () => {
    const { getByText, queryByText, queryByRole } = render(<SaveStatus />)

    expect(getByText('Changes not synced')).toBeInTheDocument()
    expect(
      getByText(
        'This device contains changes that could not be synchronized because the server version changed. Your local work is preserved.'
      )
    ).toBeInTheDocument()
    expect(queryByText(RAW_SYNC_ERROR)).not.toBeInTheDocument()
    // Recovery actions are intentionally NOT rendered inline anymore (they live in View Issues).
    expect(queryByRole('button', { name: 'Review conflict' })).not.toBeInTheDocument()
    expect(queryByRole('button', { name: 'Load server version' })).not.toBeInTheDocument()
    expect(queryByRole('button', { name: 'Advanced recovery' })).not.toBeInTheDocument()
    expect(queryByRole('button', { name: 'Force overwrite' })).not.toBeInTheDocument()
  })

  it('shows All changes saved when synced', () => {
    state.graph.syncStatus = 'synced'
    state.graph.syncError = null
    state.workflow.snapshot = { saveState: 'saved', saveError: null }
    const { getByText } = render(<SaveStatus />)
    expect(getByText('All changes saved')).toBeInTheDocument()
  })

  it('labels a local scoped validation without implying a cloud save', () => {
    state.graph.scopedHistoryEnabled = true
    state.graph.scopedHistoryStatus = 'validated'
    state.graph.scopedHistoryDetail = 'Local reference only.'
    const { getByTestId } = render(<SaveStatus />)
    expect(getByTestId('scoped-history-status')).toHaveTextContent('not cloud-saved')
    expect(getByTestId('scoped-history-status')).toHaveAttribute('title', 'Local reference only.')
  })

  it('labels durable E5 acknowledgment as local and synthetic', () => {
    state.graph.durableScopedSaveEnabled = true
    state.graph.scopedHistoryStatus = 'durably-committed-local'
    const { getByTestId } = render(<SaveStatus />)
    expect(getByTestId('scoped-history-status')).toHaveTextContent('local synthetic E5; not cloud-saved')
  })

  it('does not show scoped status when the feature flag is off', () => {
    state.graph.scopedHistoryStatus = 'validated'
    const { queryByTestId } = render(<SaveStatus />)
    expect(queryByTestId('scoped-history-status')).not.toBeInTheDocument()
  })
})
