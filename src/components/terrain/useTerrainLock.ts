'use client'

import { useEffect, useState } from 'react'
import { useForeignLock, useZoneClient } from '@/components/studio/v2/ZoneProvider'

export interface TerrainLockState {
  status: 'held' | 'view-only' | 'acquiring'
  holderName: string | null
}

/** Takes the terrain lock when the workspace opens; another admin holding it makes the workspace view-only. */
export function useTerrainLock(): TerrainLockState {
  const client = useZoneClient()
  const foreign = useForeignLock('terrain')
  const [status, setStatus] = useState<TerrainLockState['status']>(client ? 'acquiring' : 'held')

  useEffect(() => {
    if (!client) return
    let cancelled = false
    void client.ensure(['terrain']).then((granted) => {
      if (!cancelled) setStatus(granted ? 'held' : 'view-only')
    })
    return () => {
      cancelled = true
    }
  }, [client])

  if (foreign) return { status: 'view-only', holderName: foreign.holderName }
  return { status, holderName: null }
}
