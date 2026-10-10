import { Suspense } from 'react'
import PanoramaManagementClient from './PanoramaManagementClient'

export default function PanoramaManagementPage() {
  return (
    <Suspense
      fallback={
        <div role="status" aria-label="Loading Panorama Management">
          Loading Panorama Management…
        </div>
      }
    >
      <PanoramaManagementClient />
    </Suspense>
  )
}
