'use client'

import { use } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'

// The visitor map needs the browser (MapLibre); it loads on the client only.
const StudioPreview = dynamic(() => import('@/components/studio/StudioPreview').then((m) => m.StudioPreview), {
  ssr: false,
  loading: () => <div style={{ padding: 16, fontSize: 13 }}>Loading the preview…</div>,
})

/** Preview before publishing: the saved version (?commit=<save number>) as visitors will see it on NAVI Web. */
export default function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const commit = Number(useSearchParams().get('commit'))
  if (!Number.isInteger(commit) || commit < 1) {
    return (
      <div style={{ padding: 16, fontSize: 13 }}>
        Open Preview from the map editor: it shows your latest save as visitors will see it.
      </div>
    )
  }
  return <StudioPreview campusId={id} commitNo={commit} />
}
