import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ConfirmOverlay } from '../ConfirmOverlay'

const mocks = vi.hoisted(() => {
  const state = {
    pendingConfirm: {
      type: 'import-osm',
      points: [
        { lat: 1, lng: 2 },
        { lat: 1, lng: 3 },
        { lat: 2, lng: 3 },
      ],
    },
    clearPendingConfirm: vi.fn(),
    setActiveBuilding: vi.fn(),
    clearTracePoints: vi.fn(),
    activeFloor: 0,
    routeWidth: 8,
    setRouteWidth: vi.fn(),
    clearDrawPoints: vi.fn(),
  }
  return {
    state,
    dispatcher: { execute: vi.fn(() => ({ success: true })) },
    workflow: { save: vi.fn(async () => undefined) },
    editEngine: { begin: vi.fn(), doCommit: vi.fn() },
    showImportToast: vi.fn(),
  }
})

vi.mock('@/store/studio-store', () => ({
  useStudioStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
}))

vi.mock('@navi/editor', () => ({
  useEditor: () => ({
    services: {
      get: (id: string) => id === 'dispatcher' ? mocks.dispatcher : mocks.workflow,
    },
  }),
  useEditingEngine: () => mocks.editEngine,
  genId: (prefix: string) => `${prefix}-test`,
}))

vi.mock('../ImportToast', () => ({
  showImportToast: mocks.showImportToast,
}))

describe('ConfirmOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.pendingConfirm = {
      type: 'import-osm',
      points: [
        { lat: 1, lng: 2 },
        { lat: 1, lng: 3 },
        { lat: 2, lng: 3 },
      ],
    }
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        buildings: [{
          id: 'osm-1',
          name: 'Imported Hall',
          footprint: [{ lat: 1, lng: 2 }, { lat: 1, lng: 2.1 }, { lat: 1.1, lng: 2.1 }],
          height: 12,
          color: '#1C6BEB',
        }],
      }),
    })))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('imports and persists buildings only after Save', async () => {
    render(<ConfirmOverlay />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mocks.workflow.save).toHaveBeenCalledWith('manual'))
    expect(fetch).toHaveBeenCalledWith('/api/osm-buildings', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ boundary: mocks.state.pendingConfirm.points }),
    }))
    expect(mocks.dispatcher.execute).toHaveBeenCalledWith(expect.objectContaining({
      id: 'building.create',
      payload: expect.objectContaining({ name: 'Imported Hall' }),
    }))
    expect(mocks.state.clearDrawPoints).toHaveBeenCalledTimes(1)
    expect(mocks.state.clearPendingConfirm).toHaveBeenCalledTimes(1)
    expect(mocks.showImportToast).toHaveBeenCalledWith({ message: 'Imported 1 buildings from OSM', type: 'success' })
  })

  it('saves a route with the selected navigation-only display mode', async () => {
    mocks.state.pendingConfirm = {
      type: 'route',
      points: [{ lat: 1, lng: 2 }, { lat: 1, lng: 3 }],
    } as any
    render(<ConfirmOverlay />)

    fireEvent.click(screen.getByRole('button', { name: 'Navigation-only route' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mocks.workflow.save).toHaveBeenCalledWith('manual'))
    expect(mocks.dispatcher.execute).toHaveBeenCalledWith(expect.objectContaining({
      id: 'road.create',
      payload: expect.objectContaining({ displayMode: 'navigation-only' }),
    }))
  })
})
