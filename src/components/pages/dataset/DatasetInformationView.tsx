'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { CampusDocument } from '@navi/core'
import type { CampusMap } from '@/types/campus-map'
import { getBuildingCover } from '@/lib/building-cover'
import type { DatasetSelection } from './types'
import { getOutdoorItems, type ResolvedSelection } from './dataset-selectors'

/**
 * Information view — read-only authored metadata for the current selection.
 * Every field is a verbatim projection of CampusDocument/CampusMap data; a
 * field with no authored value renders "Not provided", never an invented one.
 */

interface DatasetInformationViewProps {
  campus: CampusMap
  document: CampusDocument | null
  selection: DatasetSelection
  resolved: ResolvedSelection
}

const viewTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--navi-text)',
  margin: '0 0 10px',
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

const fieldRow: CSSProperties = {
  display: 'flex',
  gap: 12,
  padding: '8px 0',
  borderBottom: '1px solid var(--navi-border)',
}

const fieldLabel: CSSProperties = {
  width: 170,
  flexShrink: 0,
  fontSize: 12,
  color: 'var(--navi-text-secondary)',
}

const fieldValue: CSSProperties = {
  fontSize: 13,
  color: 'var(--navi-text)',
  flex: 1,
  minWidth: 0,
  wordBreak: 'break-word',
}

const notProvided: CSSProperties = {
  color: 'var(--navi-text-secondary)',
  fontStyle: 'italic',
}

function Field({ label, value }: { label: string; value: string | number | undefined | null }) {
  const empty = value === undefined || value === null || value === ''
  return (
    <div className="ds-information-field" style={{ ...fieldRow, display: undefined }}>
      <div style={{ ...fieldLabel, width: undefined }}>{label}</div>
      <div style={fieldValue}>
        {empty ? <span style={notProvided}>Not provided</span> : value}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section style={{ marginBottom: 24 }}><h3 style={{ ...viewTitle, fontSize: 13, marginTop: 18 }}>{title}</h3>{children}</section>
}
function Technical({ children }: { children: ReactNode }) {
  return <details style={{ marginTop: 20 }}><summary style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--navi-text-secondary)' }}>Technical Details</summary>{children}</details>
}

export function DatasetInformationView({
  campus,
  document,
  selection,
  resolved,
}: DatasetInformationViewProps) {
  // The workspace shows the "selection no longer exists" notice above the
  // tabs; views render nothing for a dead selection.
  if (resolved.missing) return null

  const missingDocument = !document

  return (
    <div data-content-type="information">
      <h2 style={viewTitle}>Information</h2>

      {missingDocument && (
        <div style={notice}>
          The authored document is not available for this campus. Only campus-level
          information is shown.
        </div>
      )}

      {/* ── Campus scope ── */}
      {selection.kind === 'campus' && (
        <div>
          <Section title="Campus Details">
          <Field label="Name" value={campus.name} />
          <Field label="School" value={campus.schoolName} />
          <Field label="Campus group" value={campus.campusName} />
          <Field label="Description" value={document?.metadata.description} />
          </Section>
          <Section title="Dataset Summary">
          <Field label="Authored buildings" value={document?.buildings.length} />
          <Field label="Outdoor items" value={document ? getOutdoorItems(document).length : undefined} />
          <Field label="Floors" value={document?.buildings.reduce((sum, building) => sum + building.floors.length, 0)} />
          </Section>
          <Technical>
          <Field label="Campus ID" value={document?.metadata.campusId ?? campus.id} />
          <Field label="Last modified" value={document?.metadata.lastModified} />
          <Field label="Saved with editor" value={document?.metadata.editorVersion} />
          </Technical>
        </div>
      )}

      {/* ── Building scope ── */}
      {selection.kind === 'building' && resolved.building && (
        <div>
          <Section title="Building Details">
          <Field label="Name" value={resolved.building.name} />
          <Field label="Code" value={resolved.building.code} />
          <Field label="Category" value={resolved.building.category} />
          <Field label="Department" value={resolved.building.department} />
          <Field label="Description" value={resolved.building.description} />
          <Field label="Floors" value={resolved.building.floors.length} />
          <Field label="Primary image" value={getBuildingCover(resolved.building) ? 'Image reference provided' : 'No building image'} />
          </Section>
          <Technical>
          <Field label="Height (m)" value={resolved.building.height} />
          <Field label="Base elevation (m)" value={resolved.building.baseElevation} />
          <Field
            label="Aliases"
            value={resolved.building.aliases.length > 0 ? resolved.building.aliases.join(', ') : undefined}
          />
          <Field label="Building ID" value={resolved.building.id} />
          </Technical>
        </div>
      )}

      {/* ── Floor scope ── */}
      {selection.kind === 'floor' && resolved.floor && (
        <div>
          <Section title="Floor Details">
          <Field label="Label" value={resolved.floor.label} />
          <Field label="Short label" value={resolved.floor.shortLabel} />
          <Field label="Rooms" value={resolved.floor.rooms.length} />
          <Field label="Indoor POIs" value={resolved.floor.pois?.length ?? 0} />
          <Field label="Entrances" value={resolved.floor.entrances.length} />
          </Section>
          <Technical>
          <Field label="Level" value={resolved.floor.level} />
          <Field label="Elevation (m)" value={resolved.floor.elevation} />
          <Field label="Height (m)" value={resolved.floor.height} />
          <Field label="Floor ID" value={resolved.floor.id} />
          </Technical>
        </div>
      )}

      {/* ── Outdoor scope ── */}
      {selection.kind === 'outdoor' && resolved.outdoor && (
        <div>
          <Section title="Outdoor Details">
          <Field label="Name" value={resolved.outdoor.name} />
          <Field label="Item type" value={resolved.outdoor.kind === 'poi' ? 'Outdoor POI' : 'Outdoor area'} />
          <Field label="Scope" value="Outdoor" />
          <Field label="Category" value={resolved.poi?.category} />
          </Section>
          <Technical>
          {resolved.poi && (
            <>
              <Field label="Geometry" value={resolved.poi.geometry.type} />
              <Field label="Item ID" value={resolved.poi.id} />
            </>
          )}
          </Technical>
          {resolved.area && (
            <>
              <Field label="Vertices" value={resolved.area.points.length} />
              <Field label="Color" value={resolved.area.color} />
              <Field label="Item ID" value={resolved.area.id} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
