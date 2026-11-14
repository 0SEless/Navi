'use client'
import { useEffect, useState } from 'react'
import { useZoneClient } from '@/components/studio/v2/ZoneProvider'
import { buildingZone } from '@/studio-v2/client/zone-client'

/** FloorZoneGate grants entry; a later lost/released zone revokes architecture editing. */
export function useArchitectureAccess(buildingId: string): boolean {
  const client = useZoneClient()
  const [revokedBuilding, setRevokedBuilding] = useState<string | null>(null)
  useEffect(() => {
    if (!client) return
    const revoke = (zones: string[]) => { if (zones.includes(buildingZone(buildingId))) setRevokedBuilding(buildingId) }
    const offLost = client.onLost(revoke), offReleased = client.onReleased(revoke)
    return () => { offLost(); offReleased() }
  }, [client, buildingId])
  return revokedBuilding !== buildingId
}
