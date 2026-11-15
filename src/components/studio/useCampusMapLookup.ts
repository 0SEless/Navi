'use client'

import { useEffect, useState } from 'react'
import { useCampusMapStore } from '@/store/campus-map-store'

/**
 * The campus for an editor page. If it is not in the campus list yet (a reload before the list arrived, or a list
 * fetch that failed), the list is fetched again and the page shows Loading until that finishes; only then is a
 * campus that is still absent "missing" (owner 2026-11-15: "Map not found" for a campus that exists).
 */
export function useCampusMapLookup(id: string) {
  const campusMap = useCampusMapStore((s) => s.maps.find((m) => m.id === id))
  const [refetched, setRefetched] = useState(false)
  useEffect(() => {
    if (campusMap || refetched) return
    let live = true
    Promise.resolve(useCampusMapStore.getState().fetchFromSupabase())
      .catch(() => undefined)
      .finally(() => { if (live) setRefetched(true) })
    return () => { live = false }
  }, [campusMap, refetched, id])
  return { campusMap, state: campusMap ? 'ready' as const : refetched ? 'missing' as const : 'loading' as const }
}
