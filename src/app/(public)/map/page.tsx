'use client'

import { useEffect } from 'react'
import { PublicMap } from '@/components/map/PublicMap'
import { useGraphStore } from '@/store/graph-store'

export default function MapPage() {
  const load = useGraphStore((s) => s.load)

  useEffect(() => {
    load()
  }, [load])

  return <PublicMap />
}
