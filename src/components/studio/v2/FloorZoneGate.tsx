'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { buildingZone, denialMessage } from '@/studio-v2/client/zone-client'
import type { ZoneDenial } from '@/studio-v2/server/types'
import { useZoneClient } from './ZoneProvider'

/**
 * Opening a floor editor opens its building: take the building lock first (spec §7.1).
 * Denied → the owner copy and a Back button; the editor is never shown.
 */
export function FloorZoneGate({ buildingId, children }: { buildingId: string; children: ReactNode }) {
  const client = useZoneClient()
  const router = useRouter()
  const [state, setState] = useState<'pending' | 'granted' | ZoneDenial>(client ? 'pending' : 'granted')

  useEffect(() => {
    if (!client) return
    let cancelled = false
    let denial: ZoneDenial | null = null
    const off = client.onDenied((value) => {
      denial = value
    })
    void client.ensure([buildingZone(buildingId)]).then((granted) => {
      if (cancelled) return
      const fallback: ZoneDenial = { zoneKey: buildingZone(buildingId), holderName: 'Another admin', since: '', sameActor: false }
      setState(granted ? 'granted' : denial ?? fallback)
    })
    return () => {
      cancelled = true
      off()
    }
  }, [client, buildingId])

  if (state === 'granted') return <>{children}</>
  if (state === 'pending') {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>Opening floor…</div>
  }
  return (
    <div role="alertdialog" aria-labelledby="floor-zone-denied" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <p id="floor-zone-denied" style={{ fontSize: 14 }}>{denialMessage(state)}</p>
      <button type="button" onClick={() => router.back()} autoFocus>Back</button>
    </div>
  )
}
