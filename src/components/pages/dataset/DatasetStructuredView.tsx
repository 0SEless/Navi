'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { CampusDocument, Room, RoomAttributes } from '@navi/core'
import type { CampusMap } from '@/types/campus-map'
import type { DatasetSelection } from './types'
import { getCampusCounts, getOutdoorItems, type ResolvedSelection } from './dataset-selectors'

/**
 * Dataset view — structured read-only records for the current selection.
 * Lists are derived strictly from CampusDocument; counts appear only where
 * individual records cannot be listed honestly (e.g. roads expose no stable
 * display name in the document contract).
 */

interface DatasetStructuredViewProps {
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

const sectionTitle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--navi-text)',
  margin: '16px 0 6px',
}

const tableStyle: CSSProperties = {
  tableLayout: 'fixed',
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
}

const thStyle: CSSProperties = {
  overflowWrap: 'anywhere',
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid var(--navi-border)',
  color: 'var(--navi-text-secondary)',
  fontWeight: 600,
}

const tdStyle: CSSProperties = {
  overflowWrap: 'anywhere',
  padding: '6px 8px',
  borderBottom: '1px solid var(--navi-border)',
  color: 'var(--navi-text)',
}

const emptyNote: CSSProperties = {
  fontSize: 12,
  color: 'var(--navi-text-secondary)',
  fontStyle: 'italic',
  margin: '4px 0',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details open style={{ marginBottom: 18, borderBottom: '1px solid var(--navi-border)', paddingBottom: 14 }}>
      <summary style={{ ...sectionTitle, cursor: 'pointer', padding: '6px 0' }}>{title}</summary>
      {children}
    </details>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p style={emptyNote}>{children}</p>
}

function roomRows(floorRooms: Room[], attributes: RoomAttributes[]): ReactNode[] {
  if (attributes.length > 0) {
    return attributes.map((attr, index) => (
      <tr key={attr.faceId || `attr-${index}`}>
        <td style={tdStyle}>{attr.name}</td>
        <td style={tdStyle}>{attr.number ?? '—'}</td>
        <td style={tdStyle}>{attr.type ?? attr.category ?? '—'}</td>
      </tr>
    ))
  }
  return floorRooms.map((room) => (
    <tr key={room.id}>
      <td style={tdStyle}>{room.name}</td>
      <td style={tdStyle}>{room.number || '—'}</td>
      <td style={tdStyle}>{room.category}</td>
    </tr>
  ))
}

export function DatasetStructuredView({
  campus,
  document,
  selection,
  resolved,
}: DatasetStructuredViewProps) {
  if (resolved.missing) return null

  const missingDocument = !document
  const counts = document ? getCampusCounts(document) : null
  const outdoorItems = document ? getOutdoorItems(document) : []
  const floor = selection.kind === 'floor' ? resolved.floor : undefined
  const roomAttributes = floor?.roomAttributes ?? []
  const floorPois = floor?.pois ?? []
  const hasRooms = roomAttributes.length > 0 || (floor?.rooms.length ?? 0) > 0

  return (
    <div data-content-type="dataset">
      <h2 style={viewTitle}>Dataset</h2>

      {missingDocument && (
        <div style={notice}>
          The authored dataset is not available for this campus. Only campus map
          records are shown.
        </div>
      )}

      {/* ── Campus scope ── */}
      {selection.kind === 'campus' && (
        <div>
          {!document ? (
            <div>
              <Section title="Campus map record">
                <table style={tableStyle}>
                  <tbody>
                    <tr>
                      <td style={tdStyle}>Name</td>
                      <td style={tdStyle}>{campus.name}</td>
                    </tr>
                    <tr>
                      <td style={tdStyle}>Campus ID</td>
                      <td style={tdStyle}>{campus.id}</td>
                    </tr>
                    <tr>
                      <td style={tdStyle}>Buildings (stats)</td>
                      <td style={tdStyle}>{campus.stats.buildings}</td>
                    </tr>
                    <tr>
                      <td style={tdStyle}>Navigation nodes</td>
                      <td style={tdStyle}>{campus.stats.nodes}</td>
                    </tr>
                    <tr>
                      <td style={tdStyle}>Navigation edges</td>
                      <td style={tdStyle}>{campus.stats.edges}</td>
                    </tr>
                    <tr>
                      <td style={tdStyle}>Last updated</td>
                      <td style={tdStyle}>{campus.updatedAt}</td>
                    </tr>
                  </tbody>
                </table>
              </Section>
            </div>
          ) : counts ? (
            <div>
              <Section title={`Buildings (${counts.buildings})`}>
                {counts.buildings === 0 ? (
                  <Empty>No buildings are authored for this campus.</Empty>
                ) : (
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Name</th>
                        <th style={thStyle}>Code</th>
                        <th style={thStyle}>Floors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {document.buildings.map((building) => (
                        <tr key={building.id}>
                          <td style={tdStyle}>{building.name}</td>
                          <td style={tdStyle}>{building.code || '—'}</td>
                          <td style={tdStyle}>{building.floors.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>

              <Section title={`Outdoor items (${outdoorItems.length})`}>
                {outdoorItems.length === 0 ? (
                  <Empty>No outdoor POIs or areas are authored.</Empty>
                ) : (
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Name</th>
                        <th style={thStyle}>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outdoorItems.map((item) => (
                        <tr key={item.ref}>
                          <td style={tdStyle}>{item.name}</td>
                          <td style={tdStyle}>{item.kind === 'poi' ? 'POI' : 'Area'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>

              <Section title={`Floors (${document.buildings.reduce((sum, building) => sum + building.floors.length, 0)})`}>
                <table style={tableStyle}><thead><tr><th style={thStyle}>Building</th><th style={thStyle}>Floor</th><th style={thStyle}>Rooms</th><th style={thStyle}>POIs</th><th style={thStyle}>Entrances</th></tr></thead><tbody>{document.buildings.flatMap(building => building.floors.map(floor => <tr key={`${building.id}:${floor.id}`}><td style={tdStyle}>{building.name}</td><td style={tdStyle}>{floor.label}</td><td style={tdStyle}>{floor.roomAttributes?.length || floor.rooms.length}</td><td style={tdStyle}>{floor.pois?.length ?? 0}</td><td style={tdStyle}>{floor.entrances.length}</td></tr>))}</tbody></table>
                {document.buildings.every(building => building.floors.length === 0) && <Empty>No floors are authored for this campus.</Empty>}
              </Section>

              <Section title="Roads">
                <Empty>
                  {counts.roads === 0
                    ? 'No roads are authored for this campus.'
                    : `${counts.roads} road segments authored (listed on the map).`}
                </Empty>
              </Section>

              <Section title="Media">
                <table style={tableStyle}>
                  <tbody>
                    <tr>
                      <td style={tdStyle}>Panoramas</td>
                      <td style={tdStyle}>{counts.panoramas}</td>
                    </tr>
                    <tr>
                      <td style={tdStyle}>QR checkpoints</td>
                      <td style={tdStyle}>{counts.qrCheckpoints}</td>
                    </tr>
                  </tbody>
                </table>
              </Section>
            </div>
          ) : null}
        </div>
      )}

      {/* ── Building scope ── */}
      {selection.kind === 'building' && resolved.building && (
        <div>
          <Section title="Summary">
            <table style={tableStyle}>
              <tbody>
                <tr>
                  <td style={tdStyle}>Code</td>
                  <td style={tdStyle}>{resolved.building.code || '—'}</td>
                </tr>
                <tr>
                  <td style={tdStyle}>Category</td>
                  <td style={tdStyle}>{resolved.building.category}</td>
                </tr>
                <tr>
                  <td style={tdStyle}>Department</td>
                  <td style={tdStyle}>{resolved.building.department ?? '—'}</td>
                </tr>
                <tr>
                  <td style={tdStyle}>Floors</td>
                  <td style={tdStyle}>{resolved.building.floors.length}</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section title={`Floors (${resolved.building.floors.length})`}>
            {resolved.building.floors.length === 0 ? (
              <Empty>This building has no authored floors.</Empty>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Label</th>
                    <th style={thStyle}>Level</th>
                    <th style={thStyle}>Rooms</th>
                    <th style={thStyle}>Indoor POIs</th>
                  </tr>
                </thead>
                <tbody>
                  {resolved.building.floors.map((floor) => (
                    <tr key={floor.id}>
                      <td style={tdStyle}>{floor.label}</td>
                      <td style={tdStyle}>{floor.level}</td>
                      <td style={tdStyle}>{floor.rooms.length}</td>
                      <td style={tdStyle}>{floor.pois?.length ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
          <Section title="Entrances">
            {resolved.building.floors.every(floor => floor.entrances.length === 0) ? <Empty>No entrances are authored for this building.</Empty> : (
              <table style={tableStyle}><thead><tr><th style={thStyle}>Name</th><th style={thStyle}>Floor</th></tr></thead><tbody>{resolved.building.floors.flatMap(floor => floor.entrances.map(entrance => <tr key={`${floor.id}:${entrance.id}`}><td style={tdStyle}>{entrance.label || 'Unnamed entrance'}</td><td style={tdStyle}>{floor.label}</td></tr>))}</tbody></table>
            )}
          </Section>
          <Section title="Rooms and POIs">
            {resolved.building.floors.every(floor => floor.rooms.length === 0 && !floor.roomAttributes?.length && !floor.pois?.length) ? <Empty>No rooms or POIs are authored for this building.</Empty> : (
              <table style={tableStyle}><thead><tr><th style={thStyle}>Name</th><th style={thStyle}>Floor</th><th style={thStyle}>Type</th></tr></thead><tbody>{resolved.building.floors.flatMap(floor => [
                ...(floor.roomAttributes?.length ? floor.roomAttributes.map((room, index) => <tr key={`${floor.id}:room:${room.faceId || index}`}><td style={tdStyle}>{room.name}</td><td style={tdStyle}>{floor.label}</td><td style={tdStyle}>Room</td></tr>) : floor.rooms.map(room => <tr key={`${floor.id}:room:${room.id}`}><td style={tdStyle}>{room.name}</td><td style={tdStyle}>{floor.label}</td><td style={tdStyle}>Room</td></tr>)),
                ...(floor.pois ?? []).map(poi => <tr key={`${floor.id}:poi:${poi.id}`}><td style={tdStyle}>{poi.name}</td><td style={tdStyle}>{floor.label}</td><td style={tdStyle}>POI</td></tr>),
              ])}</tbody></table>
            )}
          </Section>
        </div>
      )}

      {/* ── Floor scope ── */}
      {selection.kind === 'floor' && floor && (
        <div>
          <Section title="Rooms">
            {!hasRooms ? (
              <Empty>No rooms are authored on this floor.</Empty>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Number</th>
                    <th style={thStyle}>Type</th>
                  </tr>
                </thead>
                <tbody>{roomRows(floor.rooms, roomAttributes)}</tbody>
              </table>
            )}
          </Section>

          <Section title="Indoor POIs">
            {floorPois.length === 0 ? (
              <Empty>No indoor POIs are authored on this floor.</Empty>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {floorPois.map((poi) => (
                    <tr key={poi.id}>
                      <td style={tdStyle}>{poi.name}</td>
                      <td style={tdStyle}>{poi.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Structure">
            <table style={tableStyle}>
              <tbody>
                <tr>
                  <td style={tdStyle}>Entrances</td>
                  <td style={tdStyle}>{floor.entrances.length}</td>
                </tr>
                <tr>
                  <td style={tdStyle}>Extracted doors</td>
                  <td style={tdStyle}>{floor.doors?.length ?? 0}</td>
                </tr>
                <tr>
                  <td style={tdStyle}>Hallways</td>
                  <td style={tdStyle}>{floor.hallways.length}</td>
                </tr>
              </tbody>
            </table>
          </Section>
        </div>
      )}

      {/* ── Outdoor scope ── */}
      {selection.kind === 'outdoor' && resolved.outdoor && (
        <div>
          <Section title="Record">
            <table style={tableStyle}>
              <tbody>
                <tr>
                  <td style={tdStyle}>Name</td>
                  <td style={tdStyle}>{resolved.outdoor.name}</td>
                </tr>
                <tr>
                  <td style={tdStyle}>Type</td>
                  <td style={tdStyle}>{resolved.outdoor.kind === 'poi' ? 'Outdoor POI' : 'Outdoor area'}</td>
                </tr>
                {resolved.poi && (
                  <tr>
                    <td style={tdStyle}>Category</td>
                    <td style={tdStyle}>{resolved.poi.category}</td>
                  </tr>
                )}
                {resolved.poi && (
                  <tr>
                    <td style={tdStyle}>Geometry</td>
                    <td style={tdStyle}>{resolved.poi.geometry.type}</td>
                  </tr>
                )}
                {resolved.area && (
                  <tr>
                    <td style={tdStyle}>Vertices</td>
                    <td style={tdStyle}>{resolved.area.points.length}</td>
                  </tr>
                )}
                {resolved.area && (
                  <tr>
                    <td style={tdStyle}>Color</td>
                    <td style={tdStyle}>{resolved.area.color}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>
        </div>
      )}
    </div>
  )
}
