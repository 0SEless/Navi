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
    expect(map.addLayer).toHaveBeenCalledTimes(4)
    expect(map.fitBounds).not.toHaveBeenCalled()
  })

  it('updates the existing route source with the snapped lead-in instead of rebuilding layers', () => {
    const source = { setData: vi.fn() }
    const map = createMap()
    vi.mocked(map.getSource).mockReturnValueOnce(undefined as never).mockReturnValue(source as never)
    const getNodePosition = (nodeId: string) => nodeId === 'start'
      ? { lat: 11.82, lng: 122.168 }
      : { lat: 11.821, lng: 122.169 }
    const view = render(<RouteLine map={map} route={route} getNodePosition={getNodePosition} fitCamera={false} />)
    view.rerender(<RouteLine map={map} route={{ ...route, leadIn: { lat: 11.8205, lng: 122.1685 } }} getNodePosition={getNodePosition} fitCamera={false} />)

    expect(source.setData).toHaveBeenCalledWith(expect.objectContaining({
      features: [expect.objectContaining({ geometry: { type: 'LineString', coordinates: [[122.1685, 11.8205], [122.168, 11.82], [122.169, 11.821]] } })],
    }))
    expect(map.removeLayer).not.toHaveBeenCalled()
    expect(map.removeSource).not.toHaveBeenCalled()
  })

  it('is a bold glowing line with a white edge (owner 2026-11-18: really highlight the route)', () => {
    const map = createMap()
    render(<RouteLine map={map} route={route} getNodePosition={(id) => (id === 'start' ? { lat: 11.82, lng: 122.168 } : { lat: 11.821, lng: 122.169 })} fitCamera={false} />)
    const layers = vi.mocked(map.addLayer).mock.calls.map(([layer]) => layer as { id: string; paint: Record<string, unknown> })
    expect(layers.map((l) => l.id)).toEqual(['route-glow', 'route-casing', 'route-core', 'route-flow'])
    const widthAt = (expr: unknown, zoom: number): number => {
      // ['interpolate', ['linear'], ['zoom'], z0, w0, z1, w1, ...]; widths may be case expressions: take the active one.
      const e = expr as unknown[]
      const stops = e.slice(3)
      for (let i = 0; i < stops.length; i += 2) if ((stops[i] as number) >= zoom) {
        const w = stops[i + 1]
        return Array.isArray(w) ? (w[2] as number) : (w as number)
      }
      return NaN
    }
    expect(widthAt(layers[2].paint['line-width'], 18)).toBeGreaterThanOrEqual(8)
    expect(widthAt(layers[0].paint['line-width'], 18)).toBeGreaterThanOrEqual(24)
    expect(layers[1].paint['line-color']).toBe('#FFFFFF')
  })

  it('a one-floor route is drawn loud outdoors too (owner 2026-11-18), not only indoors', () => {
    const map = createMap()
    render(<RouteLine map={map} route={route} getNodePosition={(id) => (id === 'start' ? { lat: 11.82, lng: 122.168 } : { lat: 11.821, lng: 122.169 })} getNodeFloor={() => 0} navigationSegment="outdoor" fitCamera={false} />)
    const data = vi.mocked(map.addSource).mock.calls[0][1] as { data: GeoJSON.FeatureCollection }
    expect(data.data.features.map((f) => f.properties?.active)).toEqual([1])
  })

  it('on a multi-floor route the outdoor part stays loud (owner 2026-11-18: the walk to the building was greyed)', () => {
    const map = createMap()
    const floors: Record<string, number> = { a: 0, b: 0, c: 1, d: 1 }
    const inside: Record<string, string> = { a: '', b: 'bld', c: 'bld', d: 'bld' }
    render(<RouteLine map={map} route={{ path: ['a', 'b', 'c', 'd'], cost: 1 }} getNodePosition={(id) => ({ lat: 11 + 'abcd'.indexOf(id) * 0.0001, lng: 122 })} getNodeFloor={(id) => floors[id]} getNodeBuilding={(id) => inside[id]} activeFloor={1} fitCamera={false} />)
    const data = vi.mocked(map.addSource).mock.calls[0][1] as { data: GeoJSON.FeatureCollection }
    expect(data.data.features.map((f) => f.properties?.active)).toEqual([1, 1])
  })

  it('in the 2.5D view the parts inside the open building are left to the floor strips (no line under the floor)', () => {
    const map = createMap()
    const floors: Record<string, number> = { a: 0, b: 0, c: 1, d: 1 }
    const inside: Record<string, string> = { a: '', b: 'bld', c: 'bld', d: 'bld' }
    render(<RouteLine map={map} route={{ path: ['a', 'b', 'c', 'd'], cost: 1 }} getNodePosition={(id) => ({ lat: 11 + 'abcd'.indexOf(id) * 0.0001, lng: 122 })} getNodeFloor={(id) => floors[id]} getNodeBuilding={(id) => inside[id]} hideInsideBuilding="bld" activeFloor={1} fitCamera={false} />)
    const data = vi.mocked(map.addSource).mock.calls[0][1] as { data: GeoJSON.FeatureCollection }
    // Only the GF part from outside (a→b) stays; the 1F part (c→d) is drawn on the floor instead.
    expect(data.data.features).toHaveLength(1)
  })
})
