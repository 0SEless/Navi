import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Owner 2026-11-15: after a reload the editor said "Map not found" for a campus that exists, because the campus
// list had not been fetched (again). The page now fetches the list itself and waits for it before saying so.
const store = vi.hoisted(() => ({ maps: [] as Array<{ id: string }>, fetchFromSupabase: vi.fn() }))
vi.mock('@/store/campus-map-store', () => ({
  useCampusMapStore: Object.assign((selector: (s: unknown) => unknown) => selector(store), { getState: () => store }),
}))

import { useCampusMapLookup } from '../useCampusMapLookup'

describe('useCampusMapLookup', () => {
  it('a campus missing from the list: loading while the list is fetched again, then found', async () => {
    let finish: () => void = () => {}
    store.maps = []
    store.fetchFromSupabase = vi.fn(() => new Promise<void>((resolve) => { finish = () => { store.maps = [{ id: 'c1' }]; resolve() } }))
    const { result, rerender } = renderHook(() => useCampusMapLookup('c1'))
    expect(result.current.state).toBe('loading')
    expect(store.fetchFromSupabase).toHaveBeenCalledTimes(1)
    await act(async () => { finish() })
    rerender()
    expect(result.current.state).toBe('ready')
  })

  it('still missing after the fresh list: missing', async () => {
    store.maps = []
    store.fetchFromSupabase = vi.fn(async () => {})
    const { result } = renderHook(() => useCampusMapLookup('nope'))
    await act(async () => {})
    expect(result.current.state).toBe('missing')
  })
})
