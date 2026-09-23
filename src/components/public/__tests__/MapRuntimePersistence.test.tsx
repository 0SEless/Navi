import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'
import { AdaptiveShell } from '../AdaptiveShell'
import { useNavigationMap } from '@/components/map/NavigationMap'
import NavigationMap from '@/components/map/NavigationMap'
import { usePublicStore } from '@/store/public-store'

type FakeListener = (...args: unknown[]) => void
type FakeSource = { setData: ReturnType<typeof vi.fn> }
type FakeLayer = { id: string; source: string }

interface FakeMapInstance {
  mapOptions: Record<string, unknown>
  fitBounds: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  sources: Map<string, FakeSource>
  layers: Map<string, FakeLayer>
  handlers: Map<string, Set<FakeListener>>
  camera: { center: [number, number]; zoom: number; bearing: number; pitch: number }
  jumpTo(options: { center?: [number, number]; zoom?: number; bearing?: number; pitch?: number }): void
  getCenter(): { lng: number; lat: number }
  getZoom(): number
  getBearing(): number
  getPitch(): number
  getMaxPitch(): number
  setMaxPitch(value: number): void
  addSource(id: string, source: unknown): void
  getSource(id: string): FakeSource | undefined
  removeSource(id: string): void
  addLayer(layer: FakeLayer): void
  getLayer(id: string): FakeLayer | undefined
  removeLayer(id: string): void
  on(event: string, layerOrListener: string | FakeListener, maybeListener?: FakeListener): this
  off(event: string, layerOrListener: string | FakeListener, maybeListener?: FakeListener): this
  isStyleLoaded(): boolean
  triggerRepaint(): void
  getCanvas(): { style: { cursor: string } }
}

const mapInstances = vi.hoisted(() => [] as FakeMapInstance[])
const routeState = vi.hoisted(() => ({ pathname: '/map/home', push: vi.fn() }))

vi.mock('next/navigation', () => ({
  usePathname: () => routeState.pathname,
  useRouter: () => ({ push: routeState.push }),
}))

vi.mock('../AdaptiveNav', () => ({ AdaptiveNav: () => null }))
vi.mock('../SplashOnboarding', () => ({ SplashOnboarding: () => null }))

vi.mock('maplibre-gl', () => {
  class FakeMap {
    mapOptions: Record<string, unknown>
    fitBounds = vi.fn()
    remove = vi.fn()
    resize = vi.fn()
    stop = vi.fn()
    triggerRepaint = vi.fn()
    sources = new Map<string, FakeSource>()
    layers = new Map<string, FakeLayer>()
    handlers = new Map<string, Set<FakeListener>>()
    camera = { center: [122.1677, 11.8197] as [number, number], zoom: 16, bearing: 0, pitch: 0 }
    canvas = { style: { cursor: '' } }
    maxPitch = 60

    constructor(options: Record<string, unknown>) {
      this.mapOptions = options
      this.maxPitch = Number(options.maxPitch ?? 60)
      this.remove = vi.fn()
      mapInstances.push(this)
    }

    addControl() {}

    jumpTo(options: { center?: [number, number]; zoom?: number; bearing?: number; pitch?: number }) {
      if (options.center) this.camera.center = options.center
      if (options.zoom !== undefined) this.camera.zoom = options.zoom
      if (options.bearing !== undefined) this.camera.bearing = options.bearing
      if (options.pitch !== undefined) this.camera.pitch = options.pitch
    }

    getCenter() { return { lng: this.camera.center[0], lat: this.camera.center[1] } }
    getZoom() { return this.camera.zoom }
    getBearing() { return this.camera.bearing }
    getPitch() { return this.camera.pitch }
    getMaxPitch() { return this.maxPitch }
    setMaxPitch(value: number) { this.maxPitch = value }
    isStyleLoaded() { return true }
    getCanvas() { return this.canvas }

    addSource(id: string) {
      if (this.sources.has(id)) throw new Error(`Duplicate source: ${id}`)
      this.sources.set(id, { setData: vi.fn() })
    }

    getSource(id: string) { return this.sources.get(id) }
    removeSource(id: string) { this.sources.delete(id) }

    addLayer(layer: FakeLayer) {
      if (this.layers.has(layer.id)) throw new Error(`Duplicate layer: ${layer.id}`)
      this.layers.set(layer.id, layer)
    }

    getLayer(id: string) { return this.layers.get(id) }
    removeLayer(id: string) { this.layers.delete(id) }

    on(event: string, layerOrListener: string | FakeListener, maybeListener?: FakeListener) {
      const layerId = typeof layerOrListener === 'string' ? layerOrListener : ''
      const listener = typeof layerOrListener === 'function' ? layerOrListener : maybeListener
      const key = `${event}:${layerId}`
      const listeners = this.handlers.get(key) ?? new Set<FakeListener>()
      if (listener) listeners.add(listener)
      this.handlers.set(key, listeners)
      if (event === 'load' && listener) queueMicrotask(() => listener())
      return this
    }

    off(event: string, layerOrListener: string | FakeListener, maybeListener?: FakeListener) {
      const layerId = typeof layerOrListener === 'string' ? layerOrListener : ''
      const listener = typeof layerOrListener === 'function' ? layerOrListener : maybeListener
      const key = `${event}:${layerId}`
      const listeners = this.handlers.get(key)
      if (listener) listeners?.delete(listener)
      if (listeners?.size === 0) this.handlers.delete(key)
      return this
    }
  }

  return {
    default: {
      Map: FakeMap,
      NavigationControl: class NavigationControl {
        constructor(public options?: unknown) {}
      },
      AttributionControl: class AttributionControl {},
    },
  }
})

const boundsA = { minLat: 11.8, maxLat: 11.81, minLng: 122.1, maxLng: 122.11 }
const boundsB = { minLat: 11.81, maxLat: 11.82, minLng: 122.11, maxLng: 122.12 }

function RouteLayer({ screenName }: { screenName: string }) {
  const { map, isReady } = useNavigationMap()

  useEffect(() => {
    if (!map || !isReady) return undefined

    map.addSource('transition-test-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer({ id: 'transition-test-layer', type: 'fill', source: 'transition-test-source' } as never)
    const handler = () => undefined
    map.on('click', 'transition-test-layer', handler)

    return () => {
      map.off('click', 'transition-test-layer', handler)
      if (map.getLayer('transition-test-layer')) map.removeLayer('transition-test-layer')
      if (map.getSource('transition-test-source')) map.removeSource('transition-test-source')
    }
  }, [isReady, map])

  return <div data-testid={`${screenName}-screen`}>{screenName}</div>
}

function RouteContent({ pathname, bounds = boundsA }: { pathname: string; bounds?: typeof boundsA }) {
  if (pathname.endsWith('/home')) return <div data-testid="home-screen">Home</div>
  if (pathname.endsWith('/profile')) return <div data-testid="profile-screen">Profile</div>
  if (pathname.endsWith('/explore')) {
    return <NavigationMap key="explore" bounds={bounds}><RouteLayer screenName="explore" /></NavigationMap>
  }
  if (pathname.endsWith('/navigate')) {
    return <NavigationMap key="navigate" bounds={bounds} fitBoundsOnChange={false} maxPitch={85}><RouteLayer screenName="navigate" /></NavigationMap>
  }
  return null
}

function renderRoute(pathname: string, bounds = boundsA) {
  routeState.pathname = pathname
  return render(
    <AdaptiveShell><RouteContent pathname={pathname} bounds={bounds} /></AdaptiveShell>,
  )
}

function updateRoute(
  rerender: (ui: ReactNode) => void,
  pathname: string,
  bounds = boundsA,
) {
  routeState.pathname = pathname
  rerender(<AdaptiveShell><RouteContent pathname={pathname} bounds={bounds} /></AdaptiveShell>)
}

let originalFetchCampusData: typeof usePublicStore.getState extends () => infer T
  ? T extends { fetchCampusData: infer F } ? F : never
  : never
let fetchCampusData: ReturnType<typeof vi.fn>

beforeEach(() => {
  mapInstances.length = 0
  routeState.pathname = '/map/home'
  routeState.push.mockReset()
  originalFetchCampusData = usePublicStore.getState().fetchCampusData
  fetchCampusData = vi.fn(async () => undefined)
  usePublicStore.setState({ activeTab: 'home', fetchCampusData })
})

afterEach(() => {
  cleanup()
  usePublicStore.setState({ fetchCampusData: originalFetchCampusData })
})

describe('public map runtime persistence', () => {
  it('keeps Home-first lazy and creates the runtime on the first Explore visit', async () => {
    const view = renderRoute('/map/home')

    expect(screen.getByTestId('home-screen')).toBeInTheDocument()
    expect(mapInstances).toHaveLength(0)

    updateRoute(view.rerender, '/map/explore')
    await waitFor(() => expect(mapInstances).toHaveLength(1))
    expect(await screen.findByTestId('explore-screen')).toBeInTheDocument()
  })

  it('reuses the map in both Explore/Navigate directions and cleans scene resources between them', async () => {
    const view = renderRoute('/map/explore')
    await screen.findByTestId('explore-screen')
    const map = mapInstances[0]

    expect(map.sources.has('transition-test-source')).toBe(true)
    expect(map.layers.has('transition-test-layer')).toBe(true)
    expect(map.handlers.get('click:transition-test-layer')?.size).toBe(1)

    updateRoute(view.rerender, '/map/navigate')
    await screen.findByTestId('navigate-screen')
    expect(mapInstances).toHaveLength(1)
    expect(map.remove).not.toHaveBeenCalled()
    expect(map.sources.size).toBe(1)
    expect(map.layers.size).toBe(1)
    expect(map.handlers.get('click:transition-test-layer')?.size).toBe(1)
    expect(map.getMaxPitch()).toBe(85)
    map.jumpTo({ center: [122.25, 11.9], zoom: 19, bearing: 75, pitch: 75 })

    updateRoute(view.rerender, '/map/explore')
    await screen.findByTestId('explore-screen')
    expect(mapInstances).toHaveLength(1)
    expect(map.sources.size).toBe(1)
    expect(map.layers.size).toBe(1)
    expect(map.handlers.get('click:transition-test-layer')?.size).toBe(1)
    expect(map.fitBounds).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(map.resize).toHaveBeenCalled())
    expect(map.getCenter()).toEqual({ lng: 122.25, lat: 11.9 })
    expect(map.getZoom()).toBe(19)
    expect(map.getBearing()).toBe(75)
    expect(map.getPitch()).toBe(75)
  })

  it('keeps the same map and camera through Explore → Home → Explore', async () => {
    const view = renderRoute('/map/explore')
    await screen.findByTestId('explore-screen')
    const map = mapInstances[0]
    map.jumpTo({ center: [122.25, 11.9], zoom: 19, bearing: 75, pitch: 42 })

    updateRoute(view.rerender, '/map/home')
    expect(screen.getByTestId('home-screen')).toBeInTheDocument()
    expect(map.sources.size).toBe(0)
    expect(map.layers.size).toBe(0)
    expect(map.handlers.get('click:transition-test-layer')).toBeUndefined()
    expect(screen.getByTestId('navigation-map-host')).toHaveAttribute('data-active', 'false')
    expect(map.stop).toHaveBeenCalled()

    updateRoute(view.rerender, '/map/explore')
    await screen.findByTestId('explore-screen')
    expect(mapInstances).toHaveLength(1)
    expect(map.remove).not.toHaveBeenCalled()
    expect(map.fitBounds).toHaveBeenCalledTimes(1)
    expect(map.getCenter()).toEqual({ lng: 122.25, lat: 11.9 })
    expect(map.getZoom()).toBe(19)
    expect(map.getBearing()).toBe(75)
    expect(map.getPitch()).toBe(42)
    expect(fetchCampusData).toHaveBeenCalledTimes(1)
  })

  it('fits new campus bounds while leaving unchanged bounds alone', async () => {
    const view = renderRoute('/map/explore', boundsA)
    await screen.findByTestId('explore-screen')
    const map = mapInstances[0]

    updateRoute(view.rerender, '/map/explore', { ...boundsA })
    expect(map.fitBounds).toHaveBeenCalledTimes(1)

    updateRoute(view.rerender, '/map/explore', boundsB)
    expect(map.fitBounds).toHaveBeenCalledTimes(2)
  })

  it('hides and stops the runtime for Profile, then removes it when the /map shell unmounts', async () => {
    const view = renderRoute('/map/explore')
    await screen.findByTestId('explore-screen')
    const map = mapInstances[0]

    updateRoute(view.rerender, '/map/profile')
    expect(screen.getByTestId('profile-screen')).toBeInTheDocument()
    expect(map.stop).toHaveBeenCalled()
    expect(map.sources.size).toBe(0)
    expect(map.layers.size).toBe(0)

    view.unmount()
    expect(map.remove).toHaveBeenCalledTimes(1)
  })
})
