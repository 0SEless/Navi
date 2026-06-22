'use client'

import { useEffect } from 'react'
import { StudioWorkspace } from '@/components/studio/StudioWorkspace'
import { useGraphStore } from '@/store/graph-store'

export default function StudioPage() {
  const load = useGraphStore((s) => s.load)

  useEffect(() => {
    load()
  }, [load])

  return <StudioWorkspace />
}
