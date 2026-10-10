'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Images as ImagesIcon } from 'lucide-react'
import type { Building, CampusDocument, Floor } from '@navi/core'
import type { CampusMap } from '@/types/campus-map'
import type { DatasetSelection } from './types'
import type { ResolvedSelection } from './dataset-selectors'
import { getBuildingCover } from '@/lib/building-cover'
import { BuildingCoverImage } from '@/components/shared/BuildingCoverImage'
import { uploadBuildingCover, type BuildingCoverUploadStage } from '@/services/building-cover-upload'

/**
 * Images view — selection-scoped inventory plus the selected Building's cover
 * upload controls. Only that Building's canonical imageUrl is authored; the
 * rest of the inventory remains read-only.
 *
 * The only sources surfaced (all pre-existing, all read-only):
 *   1. `CampusMap.imageUrl`  — campus-level reference, DB-backed
 *   2. `building.metadata.*` — imageUrl | photoUrl | image, the same three keys
 *                              the public BuildingSheet already reads
 *   3. `poi.metadata.*`      — the same three keys, outdoor and indoor POIs
 *
 * Deliberately NOT a general media-asset system. Excluded because each belongs
 * to a different system that is out of phase scope:
 *   - `Floor.planImageId`       → floor-plan storage/editor/publishing
 *   - `Panorama.imageAssetId`   → 360 panorama + R2 pipeline
 *   - `HotspotContent.imageUrl` → panorama hotspot content
 */

interface DatasetImagesViewProps {
  campus: CampusMap
  /** Authored document for this campus; null while unavailable (deferred loads). */
  document: CampusDocument | null
  selection: DatasetSelection
  resolved: ResolvedSelection
  /** Existing CampusDocument save seam; absent when the authored save is unavailable. */
  onSaveCover?: (buildingId: string, reference: string | null) => Promise<void>
}

/** One existing image reference found on a record — verbatim projection. */
export interface DatasetImageEntry {
  /** Stable key for list rendering. */
  id: string
  /** Display name of the owning record (campus, building, or POI). */
  label: string
  /** Breadcrumb naming the campus/building/POI context this reference lives in. */
  context: string
  /** Field the reference came from, e.g. `CampusMap.imageUrl`. */
  source: string
  /** Raw reference exactly as authored (URL or opaque asset id). */
  reference: string
}

/**
 * Metadata keys that carry an image reference, in resolution order.
 * Mirrors `BuildingSheet.getBuildingImageUrl` so the two surfaces agree.
 */

/** Minimal shape shared by the records that can own an image reference. */
interface ImageOwner {
  id: string
  name: string
  metadata?: Record<string, unknown>
}

function readMetadataImage(owner: ImageOwner): { reference: string; source: string } | null {
  return getBuildingCover(owner)
}

/**
 * Whether the reference can be used directly as an image `src`.
 * Opaque ids (e.g. `asset-campus-preview`) are rendered as a reference only —
 * they are never turned into a broken network request.
 */
function isRenderableImageSource(reference: string): boolean {
  return /^(https?:\/\/|\/\/|data:image\/|\/)/.test(reference)
}

function collectImages(
  campus: CampusMap,
  document: CampusDocument | null,
  selection: DatasetSelection,
  resolved: ResolvedSelection,
): DatasetImageEntry[] {
  const entries: DatasetImageEntry[] = []
  const campusPath = campus.name

  const pushOwner = (owner: ImageOwner, id: string, context: string): void => {
    const found = readMetadataImage(owner)
    if (!found) return
    entries.push({ id, label: owner.name, context, source: found.source, reference: found.reference })
  }

  const pushBuilding = (building: Building): void => {
    pushOwner(building, `building:${building.id}`, `${campusPath} / ${building.name}`)
  }

  const pushFloorPois = (building: Building, floor: Floor): void => {
    for (const [index, poi] of (floor.pois ?? []).entries()) {
      const found = readMetadataImage(poi)
      if (!found) continue
      entries.push({
        id: `poi:${building.id}:${floor.id}:${poi.id}:${index}`,
        label: poi.name,
        context: `${campusPath} / ${building.name} / ${floor.label}`,
        source: found.source,
        reference: found.reference,
      })
    }
  }

  // Campus-owned reference is only in scope while the campus itself is selected.
  if (selection.kind === 'campus' && typeof campus.imageUrl === 'string' && campus.imageUrl.trim()) {
    entries.push({
      id: 'campus',
      label: campus.name,
      context: 'Campus',
      source: 'CampusMap.imageUrl',
      reference: campus.imageUrl.trim(),
    })
  }

  switch (selection.kind) {
    case 'campus': {
      // Full inventory: campus + every building + indoor + outdoor POIs.
      if (!document) break
      for (const building of document.buildings) {
        pushBuilding(building)
        for (const floor of building.floors) pushFloorPois(building, floor)
      }
      for (const [index, poi] of (document.pois ?? []).entries()) {
        const found = readMetadataImage(poi)
        if (!found) continue
        entries.push({
          id: `poi-outdoor:${poi.id}:${index}`,
          label: poi.name,
          context: `${campusPath} / ${poi.name}`,
          source: found.source,
          reference: found.reference,
        })
      }
      break
    }

    case 'building': {
      const building = resolved.building
      if (!building) break
      pushBuilding(building)
      for (const floor of building.floors) pushFloorPois(building, floor)
      break
    }

    case 'floor': {
      const { building, floor } = resolved
      if (!building || !floor) break
      pushFloorPois(building, floor)
      break
    }

    case 'outdoor': {
      const poi = resolved.poi
      if (!poi) break
      pushOwner(poi, `poi-outdoor:${poi.id}`, `${campusPath} / ${poi.name}`)
      break
    }
  }

  return entries
}

const viewTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--navi-text)',
  margin: '0 0 10px',
}

const scopeNote: CSSProperties = {
  fontSize: 12,
  color: 'var(--navi-text-secondary)',
  margin: '0 0 14px',
  lineHeight: 1.5,
}

const notice: CSSProperties = {
  background: 'var(--navi-content)',
  border: '1px solid var(--navi-border)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 12,
  color: 'var(--navi-text-secondary)',
  marginBottom: 14,
}

const emptyCard: CSSProperties = {
  background: 'var(--navi-card)',
  border: '1px dashed var(--navi-border)',
  borderRadius: 10,
  padding: '22px 18px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  textAlign: 'center',
}

const emptyTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--navi-text)',
  margin: 0,
}

const emptyBody: CSSProperties = {
  fontSize: 12,
  color: 'var(--navi-text-secondary)',
  margin: 0,
  maxWidth: 460,
  lineHeight: 1.5,
}

const list: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const entryRow: CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
  background: 'var(--navi-card)',
  border: '1px solid var(--navi-border)',
  borderRadius: 10,
  padding: 10,
}

const thumb: CSSProperties = {
  width: 96,
  height: 64,
  objectFit: 'cover',
  borderRadius: 6,
  border: '1px solid var(--navi-border)',
  background: 'var(--navi-content)',
  flexShrink: 0,
}

const thumbPlaceholder: CSSProperties = {
  width: 96,
  height: 64,
  borderRadius: 6,
  border: '1px dashed var(--navi-border)',
  background: 'var(--navi-content)',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  fontSize: 10,
  color: 'var(--navi-text-secondary)',
  padding: '0 6px',
  lineHeight: 1.3,
}

const entryMeta: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
}

const entryLabel: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--navi-text)',
  overflowWrap: 'anywhere',
}

const entryContext: CSSProperties = {
  fontSize: 11,
  color: 'var(--navi-text-secondary)',
  overflowWrap: 'anywhere',
}

const entrySource: CSSProperties = {
  fontSize: 11,
  color: 'var(--navi-text-secondary)',
  overflowWrap: 'anywhere',
}

const entryReference: CSSProperties = {
  fontSize: 11,
  color: 'var(--navi-text)',
  background: 'var(--navi-content)',
  border: '1px solid var(--navi-border)',
  borderRadius: 4,
  padding: '2px 6px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  overflowWrap: 'anywhere',
  maxHeight: '3.2em',
  overflow: 'hidden',
}

/**
 * Thumbnail for a reference that resolves to a real image source. An opaque id
 * or a source that fails to load degrades to an honest placeholder — the raw
 * reference stays visible below it either way.
 */
function ImagePreview({ reference, label }: { reference: string; label: string }) {
  const [failed, setFailed] = useState(false)

  if (!isRenderableImageSource(reference)) {
    return <div style={thumbPlaceholder}>Reference only</div>
  }
  if (failed) {
    return <div style={thumbPlaceholder}>Unavailable</div>
  }

  // References are arbitrary authored URLs/assets, so next/image would require
  // configuring remotePatterns for every possible domain — out of phase scope.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={reference}
      alt={label}
      style={thumb}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

export function DatasetImagesView({
  campus,
  document,
  selection,
  resolved,
  onSaveCover,
}: DatasetImagesViewProps) {
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<BuildingCoverUploadStage | 'idle' | 'saving' | 'success' | 'error'>('idle')
  const [announcement, setAnnouncement] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [coverOverride, setCoverOverride] = useState<{
    buildingId: string
    cover: { reference: string; source: string } | null
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const removeButtonRef = useRef<HTMLButtonElement>(null)
  const restoreRemoveFocusRef = useRef(false)

  useLayoutEffect(() => {
    if (busy || !restoreRemoveFocusRef.current) return
    restoreRemoveFocusRef.current = false
    removeButtonRef.current?.focus()
  }, [busy])

  // The workspace shows the "selection no longer exists" notice above the
  // tabs; views render nothing for a dead selection.
  if (resolved.missing) return null

  const primaryBuilding = selection.kind === 'building' ? resolved.building : undefined
  const primaryCover = primaryBuilding ? getBuildingCover(primaryBuilding) : null
  const coverOverrideApplies = primaryBuilding !== undefined && coverOverride?.buildingId === primaryBuilding.id
  const visibleCover = coverOverrideApplies ? coverOverride.cover : primaryCover
  const previewBuilding = primaryBuilding && coverOverrideApplies
    ? {
      ...primaryBuilding,
      metadata: {
        ...(primaryBuilding.metadata ?? {}),
        imageUrl: visibleCover?.reference ?? null,
        photoUrl: null,
        image: null,
      },
    }
    : primaryBuilding
  const entries = collectImages(campus, document, selection, resolved).filter(entry => !primaryBuilding || entry.id !== `building:${primaryBuilding.id}`)

  const setStageAnnouncement = (next: BuildingCoverUploadStage | 'idle' | 'saving' | 'success' | 'error') => {
    setStage(next)
    const labels: Record<typeof next, string> = {
      idle: '',
      validating: 'Validating image…',
      signing: 'Preparing secure upload…',
      uploading: 'Uploading building cover…',
      verifying: 'Verifying uploaded image…',
      saving: 'Saving building cover…',
      success: 'Building cover saved.',
      error: '',
    }
    setAnnouncement(labels[next])
  }

  const handleUpload = async (file: File | undefined) => {
    if (!file || !primaryBuilding || !onSaveCover) return
    setUploadError(null)
    setCoverOverride({ buildingId: primaryBuilding.id, cover: primaryCover })
    setBusy(true)
    setStageAnnouncement('validating')
    try {
      const uploaded = await uploadBuildingCover(file, campus.id, primaryBuilding.id, {
        onStage: setStageAnnouncement,
      })
      setStageAnnouncement('saving')
      await onSaveCover(primaryBuilding.id, uploaded.reference)
      setCoverOverride({
        buildingId: primaryBuilding.id,
        cover: { reference: uploaded.reference, source: 'metadata.imageUrl' },
      })
      setStageAnnouncement('success')
    } catch (error) {
      setStageAnnouncement('error')
      setUploadError(error instanceof Error ? error.message : 'Unable to save the building cover. Try again.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    if (!primaryBuilding || !onSaveCover || !window.confirm('Remove this building cover? The building will return to the default placeholder. The stored image will remain in storage.')) return
    setUploadError(null)
    setCoverOverride({ buildingId: primaryBuilding.id, cover: primaryCover })
    setBusy(true)
    setStageAnnouncement('saving')
    try {
      await onSaveCover(primaryBuilding.id, null)
      setCoverOverride({ buildingId: primaryBuilding.id, cover: null })
      setStageAnnouncement('success')
      setAnnouncement('Building cover removed.')
    } catch (error) {
      restoreRemoveFocusRef.current = true
      setStageAnnouncement('error')
      setUploadError(error instanceof Error ? error.message : 'Unable to remove the building cover. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-content-type="images">
      <h2 style={viewTitle}>Images</h2>
      {primaryBuilding && (
        <section style={{ marginBottom: 24, maxWidth: 640 }}>
          <h3 style={{ ...viewTitle, fontSize: 13 }}>Primary Building Image</h3>
          <p style={{ ...scopeNote, fontWeight: 600, color: 'var(--navi-text)' }}>{primaryBuilding.name}</p>
          {previewBuilding && <BuildingCoverImage building={previewBuilding} />}
          {!visibleCover && <p style={{ ...scopeNote, marginTop: 12 }}>Add a front-view image so users can visually identify this building.</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Select building cover image"
              tabIndex={-1}
              disabled={busy || !onSaveCover}
              onChange={event => { void handleUpload(event.currentTarget.files?.[0]) }}
              style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}
            />
            <button
              type="button"
              disabled={busy || !onSaveCover}
              onClick={() => inputRef.current?.click()}
              style={{ minHeight: 44, padding: '9px 14px', border: 0, borderRadius: 6, background: 'var(--navi-primary)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: busy || !onSaveCover ? 'not-allowed' : 'pointer', opacity: busy || !onSaveCover ? 0.65 : 1 }}
            >
              {visibleCover ? 'Replace cover image' : 'Upload cover image'}
            </button>
            {visibleCover && (
              <button
                type="button"
                ref={removeButtonRef}
                disabled={busy || !onSaveCover}
                onClick={() => { void handleRemove() }}
                style={{ minHeight: 44, padding: '9px 14px', border: '1px solid var(--navi-border)', borderRadius: 6, background: 'var(--navi-card)', color: 'var(--navi-text)', fontSize: 12, fontWeight: 600, cursor: busy || !onSaveCover ? 'not-allowed' : 'pointer', opacity: busy || !onSaveCover ? 0.65 : 1 }}
              >
                Remove cover image
              </button>
            )}
          </div>
          {!onSaveCover && <p style={scopeNote}>The authored document is not ready for cover changes.</p>}
          <p role="status" aria-live="polite" data-upload-stage={stage} style={{ ...scopeNote, marginTop: 8, marginBottom: 0 }}>{announcement}</p>
          {uploadError && <p role="alert" style={{ ...scopeNote, color: 'var(--navi-danger, #b42318)', marginTop: 8 }}>{uploadError}</p>}
          <p style={{ ...scopeNote, marginTop: 12, marginBottom: 6 }}>Used in:</p>
          <ul style={{ ...scopeNote, paddingLeft: 20 }}><li>Explore Campus cards</li><li>Building details on map</li><li>Other building previews where applicable</li></ul>
          {visibleCover && <details><summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--navi-text-secondary)' }}>Image reference details</summary><p style={entrySource}>Source: {visibleCover.source}</p><code style={{ ...entryReference, display: 'block', maxHeight: 'none' }}>{visibleCover.reference}</code></details>}
        </section>
      )}
      {primaryBuilding && entries.length > 0 && <h3 style={{ ...viewTitle, fontSize: 13 }}>Related POI images</h3>}
      {!primaryBuilding && <>
      <p style={scopeNote}>
        Read-only list of image references already stored on this dataset&apos;s records.
        Uploading, replacing, or deleting images is not available in this view.
      </p>
      </>}

      {!document && (
        <div style={notice}>
          The authored document is not available for this campus. Only the campus-level
          image reference is shown.
        </div>
      )}

      {entries.length === 0 && !primaryBuilding ? (
        <div style={emptyCard}>
          <ImagesIcon size={20} color="var(--navi-text-secondary)" />
          <p style={emptyTitle}>No image references for this selection</p>
          <p style={emptyBody}>
            Image references are only stored on campus, building, and POI records — none
            are authored in this scope. Floor-plan, 360 panorama, and hotspot images belong
            to their own systems and are not listed here.
          </p>
        </div>
      ) : (
        <ul style={list}>
          {entries.map((entry) => (
            <li key={entry.id} style={entryRow}>
              <ImagePreview key={entry.reference} reference={entry.reference} label={entry.label} />
              <div style={entryMeta}>
                <div style={entryLabel}>{entry.label}</div>
                <div style={entryContext}>{entry.context}</div>
                <div style={entrySource}>Source: {entry.source}</div>
                <code style={entryReference}>{entry.reference}</code>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
