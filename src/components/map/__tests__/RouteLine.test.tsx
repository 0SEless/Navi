import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type maplibregl from 'maplibre-gl'
import { RouteLine } from '../RouteLine'

function createMap() {
  return {
    getLayer: vi.fn(() => undefined),
    getSource: vi.fn(() => undefined),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    fitBounds: vi.fn(),
  } as unknown as maplibregl.Map & {
    fitBounds: ReturnType<typeof vi.fn>
  }
}

const route = { path: ['start', 'end'], cost: 10 }

describe('RouteLine camera ownership seam', () => {
  it('keeps rendering route layers without fitting when the canonical camera opts out', () => {
    const map = createMap()

    render(
      <RouteLine
        map={map}
        route={route}
        getNodePosition={(nodeId) => nodeId === 'start'
          ? { lat: 11.82, lng: 122.168 }
          : { lat: 11.821, lng: 122.169 }}
        fitCamera={false}
      />,
    )

    expect(map.addSource).toHaveBeenCalledWith('route', expect.anything())
    expect(map.addLayer).toHaveBeenCalledTimes(3)
    expect(map.fitBounds).not.toHaveBeenCalled()
  })
})
