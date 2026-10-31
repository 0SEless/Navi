import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { useEffect } from 'react'
import { Graph } from '@/engine/graph'
import { useGraphStore } from '@/store/graph-store'
import { StudioLocalDraftRecoveryGate } from '../EditorBridge'

describe('StudioLocalDraftRecoveryGate', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS', 'true')
    useGraphStore.setState({
      graph: new Graph(),
      currentMapId: 'campus-gate',
      localDraftRecoveryStatus: 'loading',
      localDraftError: null,
      recoverLocalDraft: vi.fn().mockResolvedValue(undefined),
      adoptServerSnapshot: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('does not mount editor content until local draft recovery has settled', () => {
    const { getByRole, queryByTestId, rerender } = render(
      <StudioLocalDraftRecoveryGate><div data-testid="editor">Editor</div></StudioLocalDraftRecoveryGate>,
    )
    expect(getByRole('status')).toHaveTextContent('Recovering local Studio draft')
    expect(queryByTestId('editor')).not.toBeInTheDocument()

    useGraphStore.setState({ localDraftRecoveryStatus: 'recovered' })
    rerender(<StudioLocalDraftRecoveryGate><div data-testid="editor">Editor</div></StudioLocalDraftRecoveryGate>)
    expect(queryByTestId('editor')).toBeInTheDocument()
  })

  it('preserves the editor session when recovery advances from recovered to ready', () => {
    const mounted = vi.fn()
    const unmounted = vi.fn()
    function EditorSession() {
      useEffect(() => {
        mounted()
        return unmounted
      }, [])
      return <div data-testid="editor-session">Editor</div>
    }

    useGraphStore.setState({ localDraftRecoveryStatus: 'recovered' })
    const { rerender, unmount } = render(
      <StudioLocalDraftRecoveryGate><EditorSession /></StudioLocalDraftRecoveryGate>,
    )
    expect(mounted).toHaveBeenCalledTimes(1)

    useGraphStore.setState({ localDraftRecoveryStatus: 'ready' })
    rerender(<StudioLocalDraftRecoveryGate><EditorSession /></StudioLocalDraftRecoveryGate>)
    expect(mounted).toHaveBeenCalledTimes(1)
    expect(unmounted).not.toHaveBeenCalled()

    useGraphStore.setState({ currentMapId: 'campus-other' })
    rerender(<StudioLocalDraftRecoveryGate><EditorSession /></StudioLocalDraftRecoveryGate>)
    expect(mounted).toHaveBeenCalledTimes(2)
    expect(unmounted).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('provides retry and explicit server-discard choices after recovery errors', () => {
    const recover = vi.fn().mockResolvedValue(undefined)
    const adopt = vi.fn().mockResolvedValue(undefined)
    useGraphStore.setState({
      localDraftRecoveryStatus: 'error',
      localDraftError: 'Checksum mismatch; draft preserved.',
      recoverLocalDraft: recover,
      adoptServerSnapshot: adopt,
    })
    const { getByRole } = render(<StudioLocalDraftRecoveryGate><div>Editor</div></StudioLocalDraftRecoveryGate>)

    expect(getByRole('alert')).toHaveTextContent('draft preserved')
    fireEvent.click(getByRole('button', { name: 'Retry recovery' }))
    expect(recover).toHaveBeenCalledWith('campus-gate')
  })
})
