'use client'

// Save v2 zone locks in the Studio UI (spec §7): one provider per Studio page, backed by
// the tab-wide zone client. Entering a building (by any path that sets activeBuildingId)
// takes that building's lock; a denial leaves the building and shows the owner copy.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useStudioStore } from '@/store/studio-store'
import { buildingZone, type ZoneClient } from '@/studio-v2/client/zone-client'
import { getZoneClient } from '@/studio-v2/client/zone-registry'
import type { ZoneKey } from '@/studio-v2/parts/part-keys'
import type { ZoneDenial, ZoneLockView } from '@/studio-v2/server/types'
import { ZoneDeniedDialog } from './ZoneDeniedDialog'

interface ZoneContextValue {
  client: ZoneClient
  ensure(zones: ZoneKey[]): Promise<boolean>
}

const ZoneContext = createContext<ZoneContextValue | null>(null)

interface ZoneProviderProps {
  campusId: string
  /** Test seam; defaults to the tab-wide client for this campus. */
  client?: ZoneClient
  /** false when a page shows denials itself (the floor editor's FloorZoneGate). */
  showDenials?: boolean
  children: ReactNode
}

export function ZoneProvider({ campusId, client: given, showDenials = true, children }: ZoneProviderProps) {
  const client = useMemo(() => given ?? getZoneClient(campusId), [given, campusId])
  const [denial, setDenial] = useState<ZoneDenial | null>(null)

  useEffect(() => {
    client.start()
    const offDenied = client.onDenied(setDenial)
    return () => {
      offDenied()
      client.stop()
    }
  }, [client])

  // Building guard: covers the map, Explorer, wizard and floor-editor entry points at once.
  const activeBuildingId = useStudioStore((state) => state.activeBuildingId)
  useEffect(() => {
    if (!activeBuildingId) return
    let cancelled = false
    void client.ensure([buildingZone(activeBuildingId)]).then((granted) => {
      if (granted || cancelled) return
      if (useStudioStore.getState().activeBuildingId === activeBuildingId) useStudioStore.getState().setActiveBuilding(null)
    })
    return () => {
      cancelled = true
    }
  }, [client, activeBuildingId])

  const ensure = useCallback((zones: ZoneKey[]) => client.ensure(zones), [client])
  const value = useMemo(() => ({ client, ensure }), [client, ensure])

  return (
    <ZoneContext.Provider value={value}>
      {children}
      {showDenials && denial && (
        <ZoneDeniedDialog
          denial={denial}
          isOwner={client.myRole() === 'owner'}
          onClose={() => setDenial(null)}
          onForceRelease={() => {
            void client.forceRelease(denial.zoneKey).finally(() => setDenial(null))
          }}
        />
      )}
    </ZoneContext.Provider>
  )
}

/** The tab-wide zone client, or null when Save v2 isn't mounted (flag off). */
export function useZoneClient(): ZoneClient | null {
  return useContext(ZoneContext)?.client ?? null
}

/** Acquire zones before an edit; resolves true when Save v2 isn't mounted (flag off). */
export function useEnsureZone(): (zones: ZoneKey[]) => Promise<boolean> {
  const context = useContext(ZoneContext)
  return useCallback((zones: ZoneKey[]) => (context ? context.ensure(zones) : Promise.resolve(true)), [context])
}

const NO_LOCKS: ZoneLockView[] = []

/** The lock another admin (or another tab) holds on `zone`, or null. */
export function useForeignLock(zone: ZoneKey | null): ZoneLockView | null {
  const context = useContext(ZoneContext)
  const locks = useSyncExternalStore(
    (onChange) => (context ? context.client.onChange(onChange) : () => {}),
    () => (context ? context.client.locks() : NO_LOCKS),
    () => NO_LOCKS,
  )
  if (!zone) return null
  return locks.find((lock) => lock.zoneKey === zone && !lock.holderIsMe) ?? null
}
