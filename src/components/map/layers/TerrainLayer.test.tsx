import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { TerrainArea, TerrainVerticalDatum } from '@navi/core'
import { TerrainLayer } from './TerrainLayer'

const areas: TerrainArea[] = [{
  id: 'terrain-1', name: 'North lawn', color: '#22aa66', elevationMeters: 3.25,
  points: [{ lat: 14, lng: 121 }, { lat: 14.001, lng: 121 }, { lat: 14.001, lng: 121.001 }],
}]
const datum: TerrainVerticalDatum = {
  kind: 'campus-local', name: 'Campus benchmark', zeroReference: 'Local 0.000 m mark',
  elevationStatus: 'authored-not-surveyed',
}

describe('TerrainLayer information panel', () => {
  it('lets users inspect authored elevation relative to the shared datum', () => {
    render(<TerrainLayer map={null} areas={areas} datum={datum} />)
    expect(screen.getByRole('heading', { name: 'Terrain elevations' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('terrain-runtime-select-terrain-1'))
    expect(screen.getByTestId('terrain-inspection-panel')).toHaveTextContent('North lawn')
    expect(screen.getByTestId('terrain-inspection-panel')).toHaveTextContent('Authored elevation: 3.25 m')
    expect(screen.getByTestId('terrain-inspection-panel')).toHaveTextContent('Campus benchmark')
    expect(screen.getByTestId('terrain-inspection-panel')).toHaveTextContent('not surveyed')
  })

  it('renders no controls for legacy bundles without terrain', () => {
    const { container } = render(<TerrainLayer map={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('recreates the source and layers after a style reset without duplicating them', () => {
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
    const layers = new Map<string, unknown>()
    const handlers = new Map<string, (...args: unknown[]) => void>()
    const map = {
      isStyleLoaded: () => true,
      getSource: (id: string) => sources.get(id),
      addSource: (id: string) => sources.set(id, { setData: vi.fn() }),
      getLayer: (id: string) => layers.get(id),
      addLayer: (layer: { id: string }) => layers.set(layer.id, layer),
      on: (event: string, handlerOrLayer: string | ((...args: unknown[]) => void), maybeHandler?: (...args: unknown[]) => void) => {
        if (typeof handlerOrLayer === 'function') handlers.set(event, handlerOrLayer)
        else if (maybeHandler) handlers.set(event, maybeHandler)
      },
      once: vi.fn(),
      off: vi.fn(),
      getCanvas: () => ({ style: { cursor: '' } }),
    } as unknown as import('maplibre-gl').Map
    const { unmount } = render(<TerrainLayer map={map} areas={areas} datum={datum} />)
    expect(sources.size).toBe(1)
    expect(layers.size).toBe(2)

    sources.clear()
    layers.clear()
    act(() => handlers.get('styledata')?.())
    expect(sources.size).toBe(1)
    expect(layers.size).toBe(2)

    act(() => handlers.get('styledata')?.())
    expect(sources.size).toBe(1)
    expect(layers.size).toBe(2)
    unmount()
  })
})
