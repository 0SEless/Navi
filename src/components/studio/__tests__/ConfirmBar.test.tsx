import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmBar } from '../ConfirmBar'

describe('ConfirmBar', () => {
  const defaultProps = {
    tracePoints: [] as any[],
    drawPoints: [] as any[],
    routeWidth: 8,
    tool: 'route' as const,
    canConfirm: false,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onUndo: vi.fn(),
    onSetWidth: vi.fn(),
    toolLabel: 'Campus route',
  }

  it('renders tool label', () => {
    render(<ConfirmBar {...defaultProps} />)
    expect(screen.getByText('Campus route')).toBeDefined()
  })

  it('shows point count', () => {
    render(<ConfirmBar {...defaultProps} tracePoints={[{ lat: 1, lng: 2 }]} />)
    expect(screen.getByText(/1 point/)).toBeDefined()
  })

  it('shows "need 2" when route has < 2 points', () => {
    render(<ConfirmBar {...defaultProps} tracePoints={[{ lat: 1, lng: 2 }]} />)
    expect(screen.getByText(/need 2/)).toBeDefined()
  })

  it('fires onConfirm when confirm button clicked and canConfirm is true', () => {
    const onConfirm = vi.fn()
    render(<ConfirmBar {...defaultProps} canConfirm={true} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByText('Confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('disables confirm button when canConfirm is false', () => {
    render(<ConfirmBar {...defaultProps} canConfirm={false} />)
    const btn = screen.getByText('Confirm').closest('button')
    expect(btn?.disabled).toBe(true)
  })

  it('fires onCancel when cancel button clicked', () => {
    const onCancel = vi.fn()
    render(<ConfirmBar {...defaultProps} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows width controls for route tool', () => {
    render(<ConfirmBar {...defaultProps} tracePoints={[{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]} />)
    expect(screen.getByText('8')).toBeDefined()
  })

  it('does not crash when no points and undo clicked', () => {
    render(<ConfirmBar {...defaultProps} />)
    const undoBtn = screen.getByRole('button', { name: /undo/i })
    fireEvent.click(undoBtn)
  })
})
