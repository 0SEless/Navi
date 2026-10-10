'use client'

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { ArrowLeft, Boxes, Camera, Database, Images, Info } from 'lucide-react'
import type { CampusDocument } from '@navi/core'
import type { CampusMap } from '@/types/campus-map'
import { getCampusDisplayStats } from '@/components/studio/studio-display-stats'
import { DatasetExplorer } from './dataset/DatasetExplorer'
import { DatasetInformationView } from './dataset/DatasetInformationView'
import { DatasetImagesView } from './dataset/DatasetImagesView'
import { DatasetStructuredView } from './dataset/DatasetStructuredView'
import { Dataset360View } from './dataset/Dataset360View'
import { resolveSelection } from './dataset/dataset-selectors'
import type { DatasetContentType, DatasetSelection } from './dataset/types'
import { useGraphStore } from '@/store/graph-store'

/**
 * Dataset Management workspace (Phase 3).
 *
 * Read-only management layer over one authored campus:
 *   header → persistent Dataset Explorer (campus/buildings/floors/outdoor)
 *          → current location → content-type tabs → content view.
 *
 * Selection, expansion, and the active tab are transient component state —
 * nothing here mutates the authored document or any global store except the
 * selected Building cover action, which uses the existing authored save seam.
 * The workspace degrades honestly: no document → campus-level views only;
 * deleted selection → "no longer exists" notice; 360 → deferred/read-only.
 */

const CONTENT_TYPES = [
  { id: 'information', label: 'Information', icon: Info },
  { id: 'images', label: 'Images', icon: Images },
  { id: 'dataset', label: 'Dataset', icon: Boxes },
  { id: '360', label: '360', icon: Camera },
] as const satisfies ReadonlyArray<{ id: DatasetContentType; label: string; icon: typeof Info }>

const WORKSPACE_CSS = `
.ds-workspace { --navi-primary: #17855d; --navi-content: #f7faf8; height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.ds-body { display: flex; flex: 1; min-height: 0; }
.ds-explorer { width: 300px; flex-shrink: 0; overflow-y: auto; overflow-x: hidden; border-right: 1px solid var(--navi-border); background: var(--navi-card); }
.ds-explorer [data-explorer-node] { min-width: 0; }
.ds-explorer [data-explorer-node] > span { min-width: 0; flex: 1; }
.ds-content { flex: 1; min-width: 0; overflow-y: auto; overflow-x: hidden; }
.ds-selection-header { position: sticky; top: 0; z-index: 2; background: var(--navi-card); border-bottom: 1px solid var(--navi-border); }
.ds-mobile-back { display: none; }
.ds-workspace button:focus-visible, .ds-workspace input:focus-visible, .ds-workspace summary:focus-visible { outline: 2px solid var(--navi-primary); outline-offset: 2px; }
.ds-information-field { display: grid; grid-template-columns: minmax(100px, 170px) minmax(0, 1fr); }
.ds-content th:first-child:nth-last-child(3) { width: 55%; }
@media (min-width: 641px) and (max-width: 1100px) {
  .ds-explorer { width: 270px; }
  .ds-workspace [role="tab"] { padding: 9px 8px !important; }
  .ds-workspace [role="tab"] svg { display: none; }
  .ds-workspace [role="tablist"] { padding-left: 12px !important; padding-right: 12px !important; }
  .ds-information-field { grid-template-columns: minmax(80px, 100px) minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .ds-body { position: relative; }
  .ds-explorer { width: 100%; border-right: 0; }
  .ds-content { display: none; }
  .ds-workspace[data-mobile-pane="details"] .ds-explorer { display: none; }
  .ds-workspace[data-mobile-pane="details"] .ds-content { display: block; }
  .ds-mobile-back { display: inline-flex; align-items: center; gap: 6px; margin: 12px 16px 0; min-height: 36px; color: var(--navi-primary); border: 0; background: transparent; font-size: 12px; cursor: pointer; }
  .ds-information-field { grid-template-columns: 1fr; gap: 3px !important; }
  .ds-workspace [role="tab"] { padding: 9px 8px !important; gap: 4px !important; }
  .ds-workspace [role="tablist"] { padding-left: 12px !important; padding-right: 12px !important; gap: 0 !important; }
}
@media (max-width: 860px) {
  .navi-admin-shell[data-screen="dataset"] .navi-admin-sidebar { width: 48px !important; min-width: 48px !important; }
  .navi-admin-shell[data-screen="dataset"] .navi-admin-sidebar span, .navi-admin-shell[data-screen="dataset"] .navi-admin-sidebar-header { display: none !important; }
  .navi-admin-shell[data-screen="dataset"] .navi-admin-sidebar button { min-height: 44px; padding: 8px !important; justify-content: center !important; }
  .navi-admin-shell[data-screen="dataset"] .navi-admin-brand { min-width: 28px !important; }
  .navi-admin-shell[data-screen="dataset"] .navi-admin-brand > div + div, .navi-admin-shell[data-screen="dataset"] .navi-admin-search { display: none !important; }
}
`

interface DatasetWorkspaceProps {
  campus: CampusMap
  /** Authored document for this campus; null while unavailable (deferred loads). */
  document: CampusDocument | null
}

function tabStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    border: 'none',
    borderRadius: '6px 6px 0 0',
    background: active ? 'var(--navi-content)' : 'transparent',
    color: active ? 'var(--navi-text)' : 'var(--navi-text-secondary)',
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    borderBottom: active ? '2px solid var(--navi-primary)' : '2px solid transparent',
  }
}

export function DatasetWorkspace({ campus, document }: DatasetWorkspaceProps) {
  const saveBuildingCoverReference = useGraphStore(state => state.saveBuildingCoverReference)
  const authoredDocument = useGraphStore(state => state.authoredDocument)
  const currentMapId = useGraphStore(state => state.currentMapId)
  const campusReady = useGraphStore(state => state.campusReady)
  const syncStatus = useGraphStore(state => state.syncStatus)
  const pendingAuthoredMutations = useGraphStore(state => state.pendingAuthoredMutations)
  const coverSaveReady = !!authoredDocument
    && authoredDocument.metadata.campusId === campus.id
    && currentMapId === campus.id
    && campusReady
    && !['conflict', 'syncing', 'checking'].includes(syncStatus)
    && pendingAuthoredMutations.length === 0
  // Transient explorer state (selection / expansion / active tab) resets via
  // the parent's key={campus.id} — switching campuses remounts the workspace,
  // so no effect-based reset is needed.
  const [selection, setSelection] = useState<DatasetSelection>({ kind: 'campus', id: campus.id })
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(() => new Set())
  const [contentType, setContentType] = useState<DatasetContentType>('information')
  const [mobilePane, setMobilePane] = useState<'explorer' | 'details'>('explorer')

  const resolved = useMemo(
    () => resolveSelection(campus, document, selection),
    [campus, document, selection],
  )
  const tabs = CONTENT_TYPES.filter(tab => {
    if (tab.id === '360') return selection.kind !== 'outdoor'
    if (tab.id === 'images') return selection.kind === 'campus' || selection.kind === 'building' || (selection.kind === 'outdoor' && !!resolved.poi)
    return true
  })
  const activeContentType = tabs.some(tab => tab.id === contentType) ? contentType : 'information'
  const handleSelect = (next: DatasetSelection) => {
    setSelection(next)
    setMobilePane('details')
    const nextResolved = resolveSelection(campus, document, next)
    if ((contentType === '360' && next.kind === 'outdoor') || (contentType === 'images' && (next.kind === 'floor' || (next.kind === 'outdoor' && !nextResolved.poi)))) setContentType('information')
  }

  // Header statistics come from the shared authoritative helper — the same
  // one the Dataset Management campus cards use (authored/effective document
  // first, stale `campus.stats` only as fallback). The workspace receives the
  // already-resolved effective document, so precedence is complete here
  // without a separate graph fetch. Display-only: pure, no persistence.
  const displayStats = useMemo(
    () => getCampusDisplayStats({ campus, authoredDocument: document, graph: null }),
    [campus, document],
  )

  const handleToggleBuilding = (buildingId: string) => {
    setExpandedBuildings((prev) => {
      const next = new Set(prev)
      if (next.has(buildingId)) next.delete(buildingId)
      else next.add(buildingId)
      return next
    })
  }

  return (
    <div className="ds-workspace" data-mobile-pane={mobilePane}>
      <style>{WORKSPACE_CSS}</style>

      {/* Header */}
      <div
        style={{
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
          borderBottom: '1px solid var(--navi-border)',
        }}
      >
        <Link
          href="/dataset"
          aria-label="Back to campus selection"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            borderRadius: 6,
            background: 'var(--navi-card)',
            border: '1px solid var(--navi-border)',
            color: 'var(--navi-text-secondary)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={15} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--navi-text)',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Database size={16} color="var(--navi-primary)" />
            Dataset Management
          </h1>
          <p style={{ color: 'var(--navi-text-secondary)', fontSize: 11, margin: '2px 0 0' }}>
            {campus.schoolName}
            {campus.campusName ? ` · ${campus.campusName}` : ''} ·{' '}
            {displayStats.buildings} buildings
          </p>
        </div>
      </div>

      {/* Explorer + content */}
      <div className="ds-body">
        <aside className="ds-explorer">
          <DatasetExplorer
            campus={campus}
            document={document}
            selection={selection}
            expandedBuildings={expandedBuildings}
            onSelect={handleSelect}
            onToggleBuilding={handleToggleBuilding}
            onExpandAll={() => setExpandedBuildings(new Set(document?.buildings.map(building => building.id)))}
            onCollapseAll={() => setExpandedBuildings(new Set())}
          />
        </aside>

        <main className="ds-content">
          <div className="ds-selection-header">
          <button type="button" className="ds-mobile-back" onClick={() => setMobilePane('explorer')}><ArrowLeft size={14} />Back to explorer</button>
          {/* Current location */}
          <div style={{ padding: '14px 20px 0' }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                color: 'var(--navi-text-secondary)',
                marginBottom: 3,
              }}
            >
              Current selection
            </div>
            <div
              data-testid="dataset-current-location"
              aria-label="Selection breadcrumb"
              style={{ fontSize: 14, fontWeight: 600, color: 'var(--navi-text)', overflowWrap: 'anywhere', lineHeight: 1.5 }}
            >
              {resolved.path.join(' / ')}
            </div>
          </div>

          {/* Missing selection (deleted entity) */}
          {resolved.missing && (
            <div
              role="alert"
              data-testid="dataset-selection-missing"
              style={{
                margin: '12px 20px 0',
                background: 'var(--navi-content)',
                border: '1px solid var(--navi-border)',
                borderRadius: 8,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--navi-text)' }}>
                The selected location no longer exists in the authored document.
              </span>
              <button
                type="button"
                onClick={() => handleSelect({ kind: 'campus', id: campus.id })}
                style={{
                  padding: '5px 10px',
                  background: 'var(--navi-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Select campus
              </button>
            </div>
          )}

          {/* Content-type tabs */}
          <div
            role="tablist"
            aria-label="Content types"
            style={{
              display: 'flex',
              gap: 4,
              padding: '12px 20px 0',
              borderBottom: '1px solid var(--navi-border)',
              marginTop: 12,
            }}
          >
            {tabs.map(({ id, label, icon: Icon }, index) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`dataset-tab-${id}`}
                aria-selected={activeContentType === id}
                aria-controls="dataset-content-panel"
                data-content-type={id}
                onClick={() => setContentType(id)}
                tabIndex={activeContentType === id ? 0 : -1}
                onKeyDown={event => {
                  let next: number | undefined
                  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
                  if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
                  if (event.key === 'Home') next = 0
                  if (event.key === 'End') next = tabs.length - 1
                  if (next === undefined) return
                  event.preventDefault()
                  setContentType(tabs[next].id)
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
                }}
                style={tabStyle(activeContentType === id)}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
          </div>

          {/* Content view */}
          <div
            role="tabpanel"
            id="dataset-content-panel"
            aria-labelledby={`dataset-tab-${activeContentType}`}
            tabIndex={0}
            style={{ padding: '16px 20px 24px', outline: 'none' }}
          >
            {activeContentType === 'information' && (
              <DatasetInformationView
                campus={campus}
                document={document}
                selection={selection}
                resolved={resolved}
              />
            )}
            {activeContentType === 'images' && (
              <DatasetImagesView
                campus={campus}
                document={document}
                selection={selection}
                resolved={resolved}
                onSaveCover={coverSaveReady ? saveBuildingCoverReference : undefined}
              />
            )}
            {activeContentType === 'dataset' && (
              <DatasetStructuredView
                campus={campus}
                document={document}
                selection={selection}
                resolved={resolved}
              />
            )}
            {activeContentType === '360' && (
              <Dataset360View
                campus={campus}
                document={document}
                selection={selection}
                resolved={resolved}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
