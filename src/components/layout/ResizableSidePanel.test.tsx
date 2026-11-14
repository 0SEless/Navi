import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResizableSidePanel } from './ResizableSidePanel'

describe('ResizableSidePanel', () => {
  beforeEach(() => {
    // jsdom does not implement PointerEvent or capture; keep real pointer fields.
    vi.stubGlobal('PointerEvent', MouseEvent)
    Element.prototype.setPointerCapture = vi.fn()
    Element.prototype.releasePointerCapture = vi.fn()
    Element.prototype.hasPointerCapture = vi.fn(() => true)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sizes with arrow keys/Home/End, bounds width and announces the current value', () => {
    const resize = vi.fn()
    window.addEventListener('resize', resize)
    render(<ResizableSidePanel label="Inspector" side="right" defaultWidth={220} minWidth={180} maxWidth={320}><div>Properties</div></ResizableSidePanel>)
    const divider = screen.getByRole('separator', { name: 'Resize Inspector' })
    expect(divider).toHaveAttribute('aria-orientation', 'vertical')
    fireEvent.keyDown(divider, { key: 'ArrowLeft' })
    expect(divider).toHaveAttribute('aria-valuenow', '230')
    fireEvent.keyDown(divider, { key: 'Home' })
    expect(divider).toHaveAttribute('aria-valuenow', '180')
    fireEvent.keyDown(divider, { key: 'ArrowRight' })
    expect(divider).toHaveAttribute('aria-valuenow', '180')
    fireEvent.keyDown(divider, { key: 'End' })
    expect(divider).toHaveAttribute('aria-valuenow', '320')
    expect(resize).toHaveBeenCalled()
    window.removeEventListener('resize', resize)
  })

  it('captures dragging, stops canvas gestures and ends resizing on cancellation', () => {
    const gesture = vi.fn()
    render(<div onPointerDown={gesture} onKeyDown={gesture}><ResizableSidePanel label="Outliner" side="left" defaultWidth={200} minWidth={160} maxWidth={300}><div>Tree</div></ResizableSidePanel></div>)
    const divider = screen.getByRole('separator')
    fireEvent.pointerDown(divider, { clientX: 200, button: 0 })
    expect(divider.setPointerCapture).toHaveBeenCalled()
    fireEvent.pointerMove(divider, { clientX: 250 })
    expect(divider).toHaveAttribute('aria-valuenow', '250')
    fireEvent.pointerMove(divider, { clientX: 1000 })
    expect(divider).toHaveAttribute('aria-valuenow', '300')
    fireEvent.pointerCancel(divider)
    fireEvent.pointerMove(divider, { clientX: 180 })
    expect(divider).toHaveAttribute('aria-valuenow', '300')
    fireEvent.keyDown(divider, { key: 'ArrowLeft' })
    expect(divider).toHaveAttribute('aria-valuenow', '290')
    expect(gesture).not.toHaveBeenCalled()
    expect(divider.releasePointerCapture).toHaveBeenCalled()
  })

  it('collapses without unmounting children, restores width and preserves child state', () => {
    function Child() {
      const [value, setValue] = useState('draft')
      return <input aria-label="Child draft" value={value} onChange={event => setValue(event.target.value)} />
    }
    render(<ResizableSidePanel label="Outliner" side="left" defaultWidth={200} showCollapseToggle><Child /></ResizableSidePanel>)
    fireEvent.change(screen.getByLabelText('Child draft'), { target: { value: 'retained' } })
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Outliner' }))
    expect(screen.getByLabelText('Child draft')).not.toBeVisible()
    expect(screen.queryByRole('separator')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Outliner' }))
    expect(screen.getByLabelText('Child draft')).toHaveValue('retained')
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '210')
  })

  it('keeps a bounded scroll viewport with non-flex content so all inspector sections can overflow', () => {
    render(<ResizableSidePanel label="Inspector" side="right" defaultWidth={220}><div>First</div><div>Last</div></ResizableSidePanel>)
    const content = screen.getByTestId('Inspector-scroll')
    expect(content).toHaveStyle({ overflowY: 'auto', minHeight: 0, flex: '1 1 0%' })
    expect(content.style.display).not.toBe('flex')
    expect(content.parentElement).toHaveStyle({ minHeight: 0, flexShrink: 0 })
  })

  it('ends right-edge dragging on release and lost capture, ignoring non-primary buttons', () => {
    render(<ResizableSidePanel label="Inspector" side="right" defaultWidth={220}><div>Properties</div></ResizableSidePanel>)
    const divider = screen.getByRole('separator')
    fireEvent.pointerDown(divider, { clientX: 200, button: 2 })
    fireEvent.pointerMove(divider, { clientX: 150 })
    expect(divider).toHaveAttribute('aria-valuenow', '220')
    fireEvent.pointerDown(divider, { clientX: 200, button: 0 })
    fireEvent.pointerMove(divider, { clientX: 180 })
    expect(divider).toHaveAttribute('aria-valuenow', '240')
    fireEvent.pointerUp(divider)
    fireEvent.pointerMove(divider, { clientX: 100 })
    expect(divider).toHaveAttribute('aria-valuenow', '240')
    fireEvent.pointerDown(divider, { clientX: 200, button: 0 })
    fireEvent.lostPointerCapture(divider)
    fireEvent.pointerMove(divider, { clientX: 100 })
    expect(divider).toHaveAttribute('aria-valuenow', '240')
  })

  it('caps desktop width relative to workspace and reacts to viewport changes', () => {
    vi.stubGlobal('innerWidth', 1000)
    render(<ResizableSidePanel label="Inspector" side="right" defaultWidth={400} maxWidth={500}><div>Properties</div></ResizableSidePanel>)
    const divider = screen.getByRole('separator')
    expect(divider).toHaveAttribute('aria-valuemax', '350')
    expect(divider).toHaveAttribute('aria-valuenow', '350')
    vi.stubGlobal('innerWidth', 800)
    fireEvent.resize(window)
    expect(divider).toHaveAttribute('aria-valuenow', '280')
  })

  it('supports controlled icon collapse without hiding the navigation content', () => {
    const { rerender } = render(<ResizableSidePanel label="Navigation" side="left" defaultWidth={200} collapsed collapsedWidth={48} keepCollapsedContent><button>Dashboard</button></ResizableSidePanel>)
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeVisible()
    expect(screen.getByRole('complementary')).toHaveStyle({ width: '48px' })
    rerender(<ResizableSidePanel label="Navigation" side="left" defaultWidth={200} collapsed={false} collapsedWidth={48} keepCollapsedContent><button>Dashboard</button></ResizableSidePanel>)
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '200')
  })
})
