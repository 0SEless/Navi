'use client'

import { useEffect, useRef } from 'react'
import { useEditor } from '@navi/editor'
import { useStudioStore } from '@/store/studio-store'
import { buildingZone } from '@/studio-v2/client/zone-client'
import { zoneOf } from '@/studio-v2/parts/part-keys'
import type { StudioSession } from '@/studio-v2/client/studio-session'
import { useZoneClient } from './ZoneProvider'

/**
 * Leaving a building frees its lock at once when it has no unsaved changes (R45), so the
 * next admin need not wait for the 30-minute idle release. A building with unsaved changes
 * keeps its lock and the work until it is saved.
 */
export function LeaveBuildingRelease({ session }: { session: StudioSession | null }) {
  const { document } = useEditor()
  const client = useZoneClient()
  const activeBuildingId = useStudioStore((state) => state.activeBuildingId)
  const previous = useRef<string | null>(activeBuildingId)

  useEffect(() => {
    const left = previous.current
    previous.current = activeBuildingId
    if (!left || left === activeBuildingId || !client || !session) return
    const zone = buildingZone(left)
    if (!client.held().includes(zone)) return
    if (session.controller.dirtyParts(document).some((key) => zoneOf(key) === zone)) return
    void client.release([zone]).catch(() => undefined)
  }, [activeBuildingId, client, session, document])

  return null
}
