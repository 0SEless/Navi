import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmBar } from '../ConfirmBar'
import type { DrawingSessionValue } from '../useDrawingSession'

const mockState = { tool: 'route' }

vi.mock('@/store/studio-store', () => {
  const mockFn: any = (selector: any) => selector(mockState)
  mockFn.getState = () => mockState
  mockFn.subscribe = vi.fn()
  return { useStudioStore: mockFn }
})

function createMockDrawing(overrides?: Partial<DrawingSessionValue>): DrawingSessionValue {
  return {
    tracePoints: [],
    drawPoints: [],
    routeWidth: 8,
    roomDrag: null,
    pendingConfirm: null,
    addTracePoint: vi.fn(),
    setTracePoints: vi.fn(),
    undoLastPoint: vi.fn(),
    clearTracePoints: vi.fn(),
    addDrawPoint: vi.fn(),
    setDrawPoints: vi.fn(),
    undoLastDrawPoint: vi.fn(),
    clearDrawPoints: vi.fn(),
    setRoomDrag: vi.fn(),
    requestConfirm: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    setRouteWidth: vi.fn(),
    ...overrides,
  }
}




describe('ConfirmBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.tool = 'route'
  })

  it('renders tool label for route', () => {
    render(<ConfirmBar drawing={createMockDrawing({ tracePoints: [{ lat: 1, lng: 2 }] })} />)
    expect(screen.getByText('Campus route')).toBeDefined()
  })

  it('renders tool label for building', () => {
    mockState.tool = 'building'
    render(<ConfirmBar drawing={createMockDrawing({ drawPoints: [{ lat: 1, lng: 2 }] })} />)
    expect(screen.getByText('Building footprint')).toBeDefined()
  })

  it('shows point count', () => {
    const drawing = createMockDrawing({ tracePoints: [{ lat: 1, lng: 2 }] })
    render(<ConfirmBar drawing={drawing} />)
    expect(screen.getByText(/1 point/)).toBeDefined()
  })

  it('shows "need 2" when route has < 2 points', () => {
    const drawing = createMockDrawing({ tracePoints: [{ lat: 1, lng: 2 }] })
    render(<ConfirmBar drawing={drawing} />)
    expect(screen.getByText(/need 2/)).toBeDefined()
  })

  it('fires requestConfirm when confirm button clicked and canConfirm is true', () => {
    const requestConfirm = vi.fn()
    const drawing = createMockDrawing({
      tracePoints: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }],
      requestConfirm,
    })
    render(<ConfirmBar drawing={drawing} />)
    fireEvent.click(screen.getByText('Confirm'))
    expect(requestConfirm).toHaveBeenCalledTimes(1)
  })

  it('disables confirm button when canConfirm is false (route < 2 points)', () => {
    const drawing = createMockDrawing({ tracePoints: [{ lat: 1, lng: 2 }] })
    render(<ConfirmBar drawing={drawing} />)
    const btn = screen.getByText('Confirm').closest('button')
    expect(btn?.disabled).toBe(true)
  })

  it('fires cancel when cancel button clicked', () => {
    const cancel = vi.fn()
    const drawing = createMockDrawing({ tracePoints: [{ lat: 1, lng: 2 }], cancel })
    render(<ConfirmBar drawing={drawing} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('shows width controls for route tool', () => {
    const drawing = createMockDrawing({ tracePoints: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }], routeWidth: 8 })
    render(<ConfirmBar drawing={drawing} />)
    expect(screen.getByText('8')).toBeDefined()
  })

  it('does not crash when no points and undo clicked', () => {
    const drawing = createMockDrawing({ tracePoints: [{ lat: 1, lng: 2 }] })
    render(<ConfirmBar drawing={drawing} />)
    const undoBtn = screen.getByRole('button', { name: /undo/i })
    fireEvent.click(undoBtn)
  })

  it('returns null when tool is not a drawing tool', () => {
    mockState.tool = 'select'
    const { container } = render(<ConfirmBar drawing={createMockDrawing({ tracePoints: [{ lat: 1, lng: 2 }] })} />)
    expect(container.innerHTML).toBe('')
  })

  it('returns null when tool is drawing but no points placed', () => {
    const { container } = render(<ConfirmBar drawing={createMockDrawing()} />)
    expect(container.innerHTML).toBe('')
  })
})
