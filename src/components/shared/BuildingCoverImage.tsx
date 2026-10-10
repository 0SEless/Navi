'use client'

import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { getBuildingCover, isBuildingCoverSource, type BuildingCoverOwner } from '@/lib/building-cover'

/** The same fixed cover frame for the inspector, Explore cards, and map details. */
export function BuildingCoverImage({ building }: { building: BuildingCoverOwner & { name: string } }) {
  const cover = getBuildingCover(building)
  const reference = cover?.reference
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const renderable = !!reference && isBuildingCoverSource(reference)
  const failed = !!reference && failedSource === reference
  const placeholder = !cover ? 'No building image' : failed ? 'Building image unavailable' : 'Image reference only'

  return (
    <span data-building-cover="true" style={{ display: 'block', position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: 8, background: 'var(--navi-content)', color: 'var(--navi-text-secondary)' }}>
      {renderable && !failed ? (
        // Authored public URLs have arbitrary hosts; preserve the existing unoptimized contract.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={reference} alt={`Front view of ${building.name}`} loading="lazy" decoding="async" width={640} height={360} onError={() => setFailedSource(reference)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8, fontSize: 12, textAlign: 'center', padding: 12 }}>
          <Building2 size={24} aria-hidden="true" />
          <span>{placeholder}</span>
        </span>
      )}
    </span>
  )
}
