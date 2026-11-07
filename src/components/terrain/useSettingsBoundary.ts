'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LatLng } from '@navi/core'
import { useCampusMapStore } from '@/store/campus-map-store'
import { openRing, sameBoundary } from '@/lib/terrain/terrain-start'

/**
 * The boundary drawn at map creation (the campus settings, as the map list keeps them).
 * `save` writes a changed boundary back through the campus-map store, which syncs the settings.
 */
export function useSettingsBoundary(campusId: string): { points: LatLng[] | null; loaded: boolean; save(points: LatLng[]): boolean } {
  const map = useCampusMapStore((state) => state.maps.find((m) => m.id === campusId))
  const [fetched, setFetched] = useState(false)

  useEffect(() => {
    if (map || fetched) return
    let cancelled = false
    void Promise.resolve()
      .then(() => useCampusMapStore.getState().fetchFromSupabase())
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setFetched(true) })
    return () => { cancelled = true }
  }, [campusId, map, fetched])

  const raw = map?.boundary
  const points = useMemo(() => (raw && raw.length >= 3 ? openRing(raw) : null), [raw])

  const save = useCallback((next: LatLng[]): boolean => {
    const store = useCampusMapStore.getState()
    const current = store.getMap(campusId)
    if (!current || sameBoundary(next, current.boundary)) return false
    store.updateMap(campusId, { boundary: openRing(next).map((p) => ({ lat: p.lat, lng: p.lng })) })
    return true
  }, [campusId])

  return { points, loaded: Boolean(map) || fetched, save }
}
