'use client'

import { useState } from 'react'
import { importContoursGeoJson, importTopoExportGlb, type TerrainBaseSource } from '@navi/core'

const IMPORTED_REFERENCE = { name: 'Sea level (imported)', zeroMeaning: 'Mean sea level, from the imported file' }

/** Lowest and highest height in an imported base (the Heights view colour range). */
export function baseHeightRange(base: TerrainBaseSource): { minM: number; maxM: number } {
  const heights = base.kind === 'mesh' ? base.vertices.map((v) => v[2]) : base.lines.map((line) => line.elevationM)
  return { minM: Math.min(...heights), maxM: Math.max(...heights) }
}

/** Reads the picked files: a .glb with its frame GeoJSON, or a contour GeoJSON. */
export async function readTerrainFiles(files: File[]): Promise<TerrainBaseSource> {
  const glb = files.find((file) => file.name.toLowerCase().endsWith('.glb'))
  const geojsons = files.filter((file) => /\.(geo)?json$/i.test(file.name))
  if (glb) {
    const frame = geojsons.find((file) => /frame/i.test(file.name)) ?? geojsons[0]
    if (!frame) throw new Error('A .glb needs its frame file too (frame.geojson from the same TopoExport download).')
    return importTopoExportGlb(new Uint8Array(await glb.arrayBuffer()), JSON.parse(await frame.text()))
  }
  if (geojsons.length === 0) throw new Error('Pick a TopoExport .glb with its frame.geojson, or a contour GeoJSON file.')
  return importContoursGeoJson(JSON.parse(await geojsons[0].text()))
}

export function TerrainImportPanel({ hasChanges, onImport, onCancel }: {
  hasChanges: boolean
  onImport: (payload: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const importWith = async (clearTiles: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const base = await readTerrainFiles(files)
      onImport({ reference: IMPORTED_REFERENCE, base, colorRange: baseHeightRange(base), ...(clearTiles ? { clearTiles: true } : {}) })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The files could not be read.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420, fontSize: 13 }}>
      <strong>Import ground</strong>
      <span style={{ color: 'var(--navi-text-secondary, #6b7280)', fontSize: 12 }}>
        Pick the TopoExport <code>.glb</code> together with its <code>frame.geojson</code>, or one contour GeoJSON file.
        The TopoExport ground comes from a 30 m elevation model: it gives the hill&apos;s broad shape and can be off by a few metres.
      </span>
      <input aria-label="Terrain files" type="file" multiple accept=".glb,.geojson,.json" onChange={(event) => setFiles([...(event.target.files ?? [])])} />
      {error && <div role="alert" style={{ color: '#991b1b', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        {hasChanges ? (
          <>
            <button type="button" disabled={busy || files.length === 0} onClick={() => void importWith(false)}>Keep my changes</button>
            <button type="button" disabled={busy || files.length === 0} onClick={() => void importWith(true)}>Clear my changes</button>
          </>
        ) : (
          <button type="button" disabled={busy || files.length === 0} onClick={() => void importWith(false)}>Import</button>
        )}
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
