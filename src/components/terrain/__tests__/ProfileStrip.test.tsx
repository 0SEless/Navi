import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProfileStrip } from '../ProfileStrip'

afterEach(cleanup)
const slice = {
  lengthM: 30,
  before: Array.from({ length: 31 }, (_, s) => ({ s, h: s * 0.1 })),
  after: Array.from({ length: 31 }, (_, s) => ({ s, h: s * 0.1 + 1 })),
  handles: [{ key: 'p0', s: 0, h: 1 }, { key: 'p1', s: 15, h: 2.5 }],
}

describe('ProfileStrip (side view)', () => {
  it('shows each handle as a slider with its height', () => {
    render(<ProfileStrip slice={slice} onDragHandle={vi.fn()} />)
    const handles = screen.getAllByRole('slider')
    expect(handles).toHaveLength(2)
    expect(handles[1].getAttribute('aria-valuenow')).toBe('2.50')
    expect(screen.getByText('2.50 m')).toBeTruthy()
  })

  it('arrow keys and dragging move a handle straight up or down', () => {
    const onDrag = vi.fn()
    render(<ProfileStrip slice={slice} onDragHandle={onDrag} />)
    const handle = screen.getAllByRole('slider')[1]
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    expect(onDrag).toHaveBeenLastCalledWith('p1', 2.6)
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 80, pointerId: 1 })
    expect(onDrag.mock.calls.at(-1)![1]).toBeGreaterThan(2.5)
  })
})
