// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MapCanvas } from './MapCanvas'
import type { ViewportState } from '../viewport'
import type { ToolContext } from '../tools'
import { ToolRegistry } from '../tools'

afterEach(cleanup)

vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn(function MockMap() {
      this.on = vi.fn()
      this.remove = vi.fn()
      this.getCenter = vi.fn(() => ({ lat: 0, lng: 0 }))
      this.getZoom = vi.fn(() => 15)
      this.getBearing = vi.fn(() => 0)
      this.getPitch = vi.fn(() => 0)
      this.jumpTo = vi.fn()
      this.isMoving = vi.fn(() => false)
      this.unproject = vi.fn(() => ({ lng: 0, lat: 0 }))
    }),
  },
}))

const mockViewport: ViewportState = {
  zoom: 15,
  center: { lat: 0, lng: 0 },
  bearing: 0,
  pitch: 0,
  activeBuildingId: null,
  activeFloorId: null,
  activeLayer: null,
}

const mockToolContext: ToolContext = {
  services: new Proxy({} as any, { get: () => undefined }),
}

describe('MapCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    const reg = new ToolRegistry()
    const { container } = render(
      <MapCanvas
        style="https://example.com/style.json"
        viewport={mockViewport}
        toolRegistry={reg}
        toolContext={mockToolContext}
      />,
    )
    expect(container.firstChild).toBeDefined()
  })
})
