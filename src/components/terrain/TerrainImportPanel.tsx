'use client'

import { useState } from 'react'
import { primaryButton, secondaryButton, withDisabled } from './form-styles'
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

const isGlb = (file: File) => /\.glb$/i.test(file.name)
const isGeoJson = (file: File) => /\.(geo)?json$/i.test(file.name)

/** Adds newly picked files to the list: a new .glb replaces the old one, the same file twice is kept once, other types are ignored. */
export function addPickedFiles(current: File[], picked: File[]): File[] {
  let next = [...current]
  for (const file of picked.filter((f) => isGlb(f) || isGeoJson(f))) {
    next = next.filter((kept) => kept.name !== file.name && !(isGlb(file) && isGlb(kept)))
    next.push(file)
  }
  return next
}

/** What the list still needs before it can be imported, or null when it is complete. */
export function missingTerrainFile(files: File[]): string | null {
  const glb = files.some(isGlb)
  const geojsons = files.filter(isGeoJson)
  if (glb && geojsons.length === 0) return 'frame.geojson'
  if (!glb && geojsons.length > 0 && geojsons.every((file) => /frame/i.test(file.name))) return 'the TopoExport .glb'
  return null
}

export function TerrainImportPanel({ hasChanges, onImport, onCancel }: {
  hasChanges: boolean
  onImport: (payload: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [followGround, setFollowGround] = useState(true)
  const missing = missingTerrainFile(files)
  const blocked = busy || files.length === 0 || missing !== null

  const add = (picked: File[]) => {
    setError(null)
    setFiles((current) => addPickedFiles(current, picked))
  }

  const importWith = async (clearTiles: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const base = await readTerrainFiles(files)
      onImport({ reference: IMPORTED_REFERENCE, base, colorRange: baseHeightRange(base), ...(clearTiles ? { clearTiles: true } : {}), ...(followGround ? { followGround: true } : {}) })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The files could not be read.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460, fontSize: 13 }}>
      <strong style={{ fontSize: 15 }}>Import ground</strong>
      <span style={{ color: 'var(--navi-text-secondary, #6b7280)', fontSize: 12 }}>
        Add the TopoExport <code>.glb</code> and its <code>frame.geojson</code> (one at a time or together), or one contour GeoJSON file.
        The TopoExport ground comes from a 30 m elevation model: it gives the hill&apos;s broad shape and can be off by a few metres.
      </span>
      <div
        data-testid="terrain-drop"
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); add([...(event.dataTransfer?.files ?? [])]) }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 18, borderRadius: 8, textAlign: 'center',
          border: `2px dashed ${dragging ? 'var(--navi-primary, #2563eb)' : 'var(--navi-border, #d1d5db)'}`,
          background: dragging ? 'var(--navi-primary-light, #eff6ff)' : 'var(--navi-card, #fff)',
        }}
      >
        <span>Drop the files here, or</span>
        <label style={{ ...secondaryButton, display: 'inline-block' }}>
          Choose files…
          <input
            aria-label="Terrain files"
            type="file"
            multiple
            accept=".glb,.geojson,.json"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
            onChange={(event) => { add([...(event.target.files ?? [])]); event.target.value = '' }}
          />
        </label>
      </div>
      {files.length > 0 && (
        <ul aria-label="Chosen files" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {files.map((file) => (
            <li key={file.name} data-file={file.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--navi-surface, #f3f4f6)' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
              <button type="button" aria-label={`Remove ${file.name}`} title="Remove" onClick={() => setFiles((current) => current.filter((kept) => kept !== file))}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: 'var(--navi-text-secondary, #6b7280)' }}>×</button>
            </li>
          ))}
        </ul>
      )}
      {missing && <div style={{ color: '#92400e', fontSize: 12 }}>Still needed: {missing}</div>}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" checked={followGround} onChange={(event) => setFollowGround(event.target.checked)} />
        Set all buildings to follow the ground (buildings set to a fixed height keep it)
      </label>
      {error && <div role="alert" style={{ color: '#991b1b', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        {hasChanges ? (
          <>
            <button type="button" style={withDisabled(primaryButton, blocked)} disabled={blocked} onClick={() => void importWith(false)}>Keep my changes</button>
            <button type="button" style={withDisabled(secondaryButton, blocked)} disabled={blocked} onClick={() => void importWith(true)}>Clear my changes</button>
          </>
        ) : (
          <button type="button" style={withDisabled(primaryButton, blocked)} disabled={blocked} onClick={() => void importWith(false)}>{busy ? 'Importing…' : 'Import'}</button>
        )}
        <button type="button" style={secondaryButton} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
