'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { GateScreen } from '@/components/kiosk/GateScreen'
import { discoverPublicQrCheckpoint } from '@/hooks/useQrNavigateDeepLink'
import { usePublicStore } from '@/store/public-store'
import { resolveQrCheckpointLocation } from '@/lib/qr-location'
import type { QrIndexEntry } from '@navi/core'

export default function KioskCheckpointPage() {
  const params = useParams<{ checkpointId: string }>()
  const checkpointId = useMemo(() => {
    try { return decodeURIComponent(params.checkpointId) } catch { return '' }
  }, [params.checkpointId])
  const campus = usePublicStore((state) => state.campus)
  const currentCampusId = usePublicStore((state) => state.currentCampusId)
  const fetchCampusData = usePublicStore((state) => state.fetchCampusData)
  const [checkpoint, setCheckpoint] = useState<QrIndexEntry | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid'>('loading')

  useEffect(() => {
    let cancelled = false
    setCheckpoint(null)
    setStatus('loading')
    void discoverPublicQrCheckpoint(checkpointId).then(async (result) => {
      if (cancelled) return
      if (result.status !== 'resolved') { setStatus('invalid'); return }
      setCheckpoint(result.checkpoint)
      await fetchCampusData(result.campusId)
      if (!cancelled) setStatus('ready')
    })
    return () => { cancelled = true }
  }, [checkpointId, fetchCampusData])

  const startNodeId = useMemo(() => {
    if (!checkpoint || !campus || campus.campusId !== currentCampusId) return null
    return resolveQrCheckpointLocation(checkpoint, campus, currentCampusId).nodeId
  }, [campus, checkpoint, currentCampusId])

  if (status === 'loading') return <main className="flex min-h-screen items-center justify-center text-lg" role="status">Loading gate screen…</main>
  if (status === 'invalid' || !campus || !checkpoint) return <main className="flex min-h-screen items-center justify-center p-8 text-center text-lg" role="alert">This gate screen&apos;s checkpoint has no routing anchor. Ask staff to set it up.</main>
  return <GateScreen campus={campus} checkpointId={checkpointId} startNodeId={startNodeId} />
}
