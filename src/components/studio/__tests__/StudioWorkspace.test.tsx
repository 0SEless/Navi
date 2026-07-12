import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'

vi.mock('@navi/editor', () => ({
  useEditor: vi.fn(),
  EditorProvider: ({ children }: any) => children,
  PropertiesPanel: () => <div>PropertiesPanel</div>,
}))

vi.mock('../EditorBridge', () => ({
  EditorBridge: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('../StudioCanvas', () => ({
  StudioCanvas: () => <div>StudioCanvas</div>,
}))

vi.mock('../StudioToolbar', () => ({
  StudioToolbar: () => <div>StudioToolbar</div>,
}))

vi.mock('../ExplorerPanel', () => ({
  ExplorerPanel: () => <div>ExplorerPanel</div>,
}))

vi.mock('../ConfirmOverlay', () => ({
  ConfirmOverlay: () => <div>ConfirmOverlay</div>,
}))

import { useEditor } from '@navi/editor'
import { StudioWorkspace } from '../StudioWorkspace'

describe('StudioWorkspace', () => {
  let mockSave: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    mockSave = vi.fn().mockResolvedValue(undefined)
    ;(useEditor as any).mockReturnValue({
      services: {
        get: (id: string) => {
          if (id === 'workflow') return { save: mockSave }
          return null
        },
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('triggers autosave every 30 seconds', () => {
    render(<StudioWorkspace mapId="test-campus" />)

    expect(mockSave).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(30000) })

    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(mockSave).toHaveBeenCalledWith('autosave')
  })

  it('autosave fires repeatedly across intervals', () => {
    render(<StudioWorkspace mapId="test-campus" />)

    act(() => { vi.advanceTimersByTime(90000) })

    expect(mockSave).toHaveBeenCalledTimes(3)
  })

  it('clears interval on unmount', () => {
    const { unmount } = render(<StudioWorkspace mapId="test-campus" />)

    unmount()

    act(() => { vi.advanceTimersByTime(30000) })
    expect(mockSave).not.toHaveBeenCalled()
  })
})
