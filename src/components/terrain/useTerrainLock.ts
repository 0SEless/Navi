'use client'

import { useCallback, useEffect, useState } from 'react'
import { useForeignLock, useZoneClient } from '@/components/studio/v2/ZoneProvider'

export interface TerrainLockState {
  status: 'held' | 'view-only' | 'acquiring'
  holderName: string | null
  /** The lock is held by this same account in another tab (or a closed tab not timed out yet). */
  sameActor?: boolean
  /** Force release is allowed (campus owner): "Take over here". */
  canTakeOver?: boolean
  takeOver?: () => Promise<void>
}

/** Takes the terrain lock when the workspace opens; another admin holding it makes the workspace view-only. */
export function useTerrainLock(): TerrainLockState {
  const client = useZoneClient()
  const foreign = useForeignLock('terrain')
  const [status, setStatus] = useState<TerrainLockState['status']>(client ? 'acquiring' : 'held')
  const [sameActor, setSameActor] = useState(false)

  // Subscribed before the lock is asked for, so the denial of that first request is seen.
  useEffect(() => {
    if (!client) return
    return client.onDenied((denial) => {
      if (denial.zoneKey === 'terrain') setSameActor(denial.sameActor)
    })
  }, [client])

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

  const takeOver = useCallback(async () => {
    if (!client) return
    await client.forceRelease('terrain')
    const granted = await client.ensure(['terrain'])
    setStatus(granted ? 'held' : 'view-only')
    if (granted) setSameActor(false)
  }, [client])

  const extras = { sameActor, canTakeOver: client?.myRole() === 'owner', takeOver }
  if (status === 'held') return { status, holderName: null, ...extras, sameActor: false }
  if (foreign) return { status: 'view-only', holderName: foreign.holderName, ...extras }
  return { status, holderName: null, ...extras }
}
