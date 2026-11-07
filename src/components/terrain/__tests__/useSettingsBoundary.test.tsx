import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useCampusMapStore } from '@/store/campus-map-store'
import type { CampusMap } from '@/types/campus-map'
import { useSettingsBoundary } from '../useSettingsBoundary'

const ring = [{ lat: 11.817, lng: 122.168 }, { lat: 11.8175, lng: 122.1697 }, { lat: 11.8189, lng: 122.1732 }]

function campus(boundary = ring): CampusMap {
  return {
    id: 'c1', name: 'ASU', schoolName: 'ASU', boundary, center: { lat: 11.818, lng: 122.17 },
    createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', stats: { buildings: 0, nodes: 0, edges: 0 },
  }
}

const original = useCampusMapStore.getState()
let updateMap: ReturnType<typeof vi.fn>

beforeEach(() => {
  updateMap = vi.fn()
  useCampusMapStore.setState({ maps: [], updateMap, fetchFromSupabase: vi.fn(async () => undefined) })
})

afterEach(() => {
  cleanup()
  useCampusMapStore.setState(original, true)
})

describe('useSettingsBoundary', () => {
  it('reads the boundary drawn at map creation', () => {
    useCampusMapStore.setState({ maps: [campus()] })
    const { result } = renderHook(() => useSettingsBoundary('c1'))
    expect(result.current.points).toEqual(ring)
    expect(result.current.loaded).toBe(true)
  })

  it('fetches the campus list once when the campus is missing', async () => {
    const fetchFromSupabase = vi.fn(async () => { useCampusMapStore.setState({ maps: [campus()] }) })
    useCampusMapStore.setState({ fetchFromSupabase })
    const { result } = renderHook(() => useSettingsBoundary('c1'))
    await waitFor(() => expect(result.current.points).toEqual(ring))
    expect(fetchFromSupabase).toHaveBeenCalledTimes(1)
    expect(result.current.loaded).toBe(true)
  })

  it('a failed fetch leaves points null and loaded true', async () => {
    useCampusMapStore.setState({ fetchFromSupabase: vi.fn(async () => { throw new Error('offline') }) })
    const { result } = renderHook(() => useSettingsBoundary('c1'))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.points).toBeNull()
  })

  it('a boundary with fewer than 3 corners counts as none', () => {
    useCampusMapStore.setState({ maps: [campus([])] })
    const { result } = renderHook(() => useSettingsBoundary('c1'))
    expect(result.current.points).toBeNull()
  })

  it('save writes the open ring only when it changed', () => {
    useCampusMapStore.setState({ maps: [campus()] })
    const { result } = renderHook(() => useSettingsBoundary('c1'))
    let wrote = true
    act(() => { wrote = result.current.save([...ring, ring[0]]) })
    expect(wrote).toBe(false)
    expect(updateMap).not.toHaveBeenCalled()
    const grown = [...ring, { lat: 11.816, lng: 122.172 }]
    act(() => { wrote = result.current.save([...grown, grown[0]]) })
    expect(wrote).toBe(true)
    expect(updateMap).toHaveBeenCalledWith('c1', { boundary: grown })
  })
})
