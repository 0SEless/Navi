import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIdleReset } from '../useIdleReset'

function Harness({ onIdle }: { onIdle: () => void }) {
  useIdleReset(60_000, onIdle)
  return null
}

describe('useIdleReset', () => {
  afterEach(() => vi.useRealTimers())
  it('resets the idle countdown after user activity', () => {
    vi.useFakeTimers()
    const onIdle = vi.fn()
    render(<Harness onIdle={onIdle} />)
    act(() => vi.advanceTimersByTime(59_000))
    window.dispatchEvent(new Event('pointerdown'))
    act(() => vi.advanceTimersByTime(59_000))
    expect(onIdle).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1_000))
    expect(onIdle).toHaveBeenCalledOnce()
  })
})
