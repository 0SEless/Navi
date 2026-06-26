'use client'

import { useEffect, useState } from 'react'
import { PublicMap } from '@/components/map/PublicMap'
import { useGraphStore } from '@/store/graph-store'

export default function CampusMapPage({ params }: { params: Promise<{ campus: string }> }) {
  const load = useGraphStore((s) => s.load)
  const [campusId, setCampusId] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => setCampusId(p.campus))
  }, [params])

  useEffect(() => {
    load()
  }, [load])

  if (!campusId) return null

  return <PublicMap campusId={campusId} />
}
