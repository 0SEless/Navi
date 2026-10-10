'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { Building2, ChevronDown, ChevronRight, Layers, MapPin, Shapes, Search, ChevronsDown, ChevronsUp } from 'lucide-react'
import type { CampusDocument } from '@navi/core'
import type { CampusMap } from '@/types/campus-map'
import type { DatasetSelection } from './types'
import { getOutdoorItems } from './dataset-selectors'

/**
 * Persistent Dataset Explorer — campus → buildings → floors + outdoor items.
 *
 * Read-only tree over the authored document. Expansion state and selection
 * are owned by DatasetWorkspace; this component only renders what it is
 * given. Two distinct controls per node:
 *   - expand/collapse chevron (aria-expanded) — changes visibility only
 *   - node button (aria-pressed) — changes the current selection
 */

interface DatasetExplorerProps {
  campus: CampusMap
  document: CampusDocument | null
  selection: DatasetSelection
  expandedBuildings: Set<string>
  onSelect: (selection: DatasetSelection) => void
  onToggleBuilding: (buildingId: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
}

const sectionLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: 'var(--navi-text-secondary)',
  margin: '14px 0 6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const countBadge: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--navi-text-secondary)',
  background: 'var(--navi-content)',
  padding: '1px 6px',
  borderRadius: 8,
}

const emptyNote: CSSProperties = {
  fontSize: 11,
  color: 'var(--navi-text-secondary)',
  fontStyle: 'italic',
  margin: '4px 0 4px 8px',
}

const nodeBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  padding: '6px 8px',
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: 'var(--navi-text-secondary)',
  fontSize: 12,
  fontWeight: 500,
  textAlign: 'left',
  cursor: 'pointer',
}

const nodeSelected: CSSProperties = {
  ...nodeBase,
  background: 'var(--navi-content)',
  color: 'var(--navi-text)',
  fontWeight: 600,
  boxShadow: 'inset 2px 0 0 var(--navi-primary)',
}

const chevronButton: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 26,
  flexShrink: 0,
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: 'var(--navi-text-secondary)',
  cursor: 'pointer',
}

export function DatasetExplorer({
  campus,
  document,
  selection,
  expandedBuildings,
  onSelect,
  onToggleBuilding,
  onExpandAll,
  onCollapseAll,
}: DatasetExplorerProps) {
  const [query, setQuery] = useState('')
  const filter = query.trim().toLocaleLowerCase()
  const { buildings, outdoorItems } = useMemo(() => {
    const matches = (name: string) => name.toLocaleLowerCase().includes(filter)
    return {
      buildings: (document?.buildings ?? []).filter(building => matches(building.name) || building.floors.some(floor => matches(floor.label) || floor.pois?.some(poi => matches(poi.name)))),
      outdoorItems: getOutdoorItems(document).filter(item => matches(item.name)),
    }
  }, [document, filter])

  const campusSelected = selection.kind === 'campus'

  return (
    <nav aria-label="Dataset Explorer" style={{ padding: 12 }}>
      <h2 style={{ ...sectionLabel, marginTop: 0 }}>
        <span>Dataset Explorer</span>
        <span style={{ display: 'flex' }}>
          <button type="button" title="Expand all buildings" aria-label="Expand all buildings" onClick={onExpandAll} style={chevronButton}><ChevronsDown size={14} /></button>
          <button type="button" title="Collapse all buildings" aria-label="Collapse all buildings" onClick={onCollapseAll} style={chevronButton}><ChevronsUp size={14} /></button>
        </span>
      </h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--navi-border)', borderRadius: 7, padding: '7px 8px', marginBottom: 12 }}>
        <Search size={13} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--navi-text-secondary)' }} />
        <input type="search" aria-label="Search dataset" placeholder="Find a building, floor, or POI" value={query} onChange={event => setQuery(event.target.value)} style={{ width: '100%', minWidth: 0, border: 0, background: 'transparent', color: 'var(--navi-text)', fontSize: 12 }} />
      </div>

      {/* Campus root */}
      <button
        type="button"
        aria-pressed={campusSelected}
        data-explorer-node="campus"
        title={campus.name}
        onClick={() => onSelect({ kind: 'campus', id: campus.id })}
        style={campusSelected ? nodeSelected : nodeBase}
      >
        <MapPin size={13} style={{ flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {campus.name}
        </span>
      </button>

      {/* Buildings */}
      <h3 style={sectionLabel}>
        <span>Buildings</span>
        <span style={countBadge}>{document ? buildings.length : '—'}</span>
      </h3>

      {!document && (
        <p style={emptyNote}>Authored document is not available for this campus.</p>
      )}
      {document && buildings.length === 0 && (
        <p style={emptyNote}>No authored buildings are available for this campus.</p>
      )}

      {buildings.map((building) => {
        const expanded = !!filter || expandedBuildings.has(building.id)
        const matchesBuilding = building.name.toLocaleLowerCase().includes(filter)
        const floors = building.floors.filter(floor => !filter || matchesBuilding || floor.label.toLocaleLowerCase().includes(filter) || floor.pois?.some(poi => poi.name.toLocaleLowerCase().includes(filter)))
        const buildingSelected =
          selection.kind === 'building' && selection.buildingId === building.id

        return (
          <div key={building.id}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={expanded ? `Collapse ${building.name}` : `Expand ${building.name}`}
                onClick={() => onToggleBuilding(building.id)}
                disabled={!!filter}
                style={chevronButton}
              >
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              <button
                type="button"
                aria-pressed={buildingSelected}
                data-explorer-node="building"
                data-building-id={building.id}
                onClick={() => onSelect({ kind: 'building', buildingId: building.id })}
                style={buildingSelected ? nodeSelected : nodeBase}
                title={building.name}
              >
                <Building2 size={13} style={{ flexShrink: 0 }} />
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {building.name}
                </span>
              </button>
            </div>

            {expanded && (
              <div style={{ marginLeft: 18 }}>
                {building.floors.length === 0 && (
                  <p style={emptyNote}>This building has no authored floors.</p>
                )}
                {floors.map((floor) => {
                  const floorSelected =
                    selection.kind === 'floor' &&
                    selection.buildingId === building.id &&
                    selection.floorId === floor.id
                  return (
                    <div key={floor.id}>
                    <button
                      key={floor.id}
                      type="button"
                      aria-pressed={floorSelected}
                      data-explorer-node="floor"
                      data-building-id={building.id}
                      data-floor-id={floor.id}
                      title={floor.label}
                      onClick={() =>
                        onSelect({ kind: 'floor', buildingId: building.id, floorId: floor.id })
                      }
                      style={floorSelected ? nodeSelected : nodeBase}
                    >
                      <Layers size={12} style={{ flexShrink: 0 }} />
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {floor.label}
                      </span>
                    </button>
                    {filter && floor.pois?.filter(poi => poi.name.toLocaleLowerCase().includes(filter)).map(poi => (
                      <div key={poi.id} title={poi.name} style={{ margin: '2px 0 4px 24px', fontSize: 11, color: 'var(--navi-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{poi.name}</div>
                    ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Outdoor */}
      <h3 style={sectionLabel}>
        <span>Outdoor</span>
        <span style={countBadge}>{document ? outdoorItems.length : '—'}</span>
      </h3>

      {!document && <p style={emptyNote}>Authored document is not available for this campus.</p>}
      {document && outdoorItems.length === 0 && (
        <p style={emptyNote}>No outdoor items are available.</p>
      )}

      {outdoorItems.map((item) => {
        const itemSelected =
          selection.kind === 'outdoor' && selection.ref === item.ref
        return (
          <button
            key={item.ref}
            type="button"
            aria-pressed={itemSelected}
            data-explorer-node="outdoor"
            data-outdoor-ref={item.ref}
            onClick={() => onSelect({ kind: 'outdoor', ref: item.ref })}
            style={itemSelected ? nodeSelected : nodeBase}
            title={item.name}
          >
            <Shapes size={13} style={{ flexShrink: 0 }} />
            <span
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {item.name}
            </span>
          </button>
        )
      })}
      {filter && buildings.length === 0 && outdoorItems.length === 0 && <p role="status" style={emptyNote}>No matching locations</p>}
    </nav>
  )
}
