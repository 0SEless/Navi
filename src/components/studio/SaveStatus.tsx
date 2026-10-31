'use client'

import { useWorkflow } from '@navi/editor'
import { isStudioLocalDraftModeEnabled, useGraphStore } from '@/store/graph-store'
import { isStudioDurableScopedSaveEnabled, isStudioScopedHistoryEnabled } from '@/services/studio-scoped-history-flag'
import { getSaveStatusModel } from './save-status-model'

/**
 * Compact save-state indicator for the Studio toolbar.
 *
 * Recovery actions are intentionally NOT rendered here (toolbar stays clean).
 * Sync/conflict recovery now lives inside the existing View Issues surface via
 * SyncIssueCard.
 */
export function SaveStatus() {
  const { snapshot } = useWorkflow()
  const syncStatus = useGraphStore((state) => state.syncStatus)
  const syncError = useGraphStore((state) => state.syncError)
  const localDraftStatus = useGraphStore((state) => state.localDraftStatus)
  const localDraftError = useGraphStore((state) => state.localDraftError)
  const scopedHistoryStatus = useGraphStore((state) => state.scopedHistoryStatus)
  const scopedHistoryDetail = useGraphStore((state) => state.scopedHistoryDetail)

  const status = getSaveStatusModel({
    saveState: snapshot.saveState,
    syncStatus,
    syncError,
    saveError: snapshot.saveError,
    localDraftMode: isStudioLocalDraftModeEnabled(),
    localDraftStatus,
    localDraftError,
  })
  const scopedHistoryLabels = {
    'session-only': 'Scoped history: local only; resets on reload',
    validating: 'Validating scoped operation locally…',
    validated: 'Scoped operation validated locally; not cloud-saved',
    rejected: 'Scoped operation not recorded; draft remains available',
    conflict: 'Local scoped history conflict; draft remains available',
    error: 'Local scoped history unavailable; draft remains separate',
    'local-draft': 'Local draft ready; synthetic E5 save is opt-in at Save',
    saving: 'Saving to local synthetic E5…',
    'durably-committed-local': 'Saved to local synthetic E5; not cloud-saved',
    failed: 'Local E5 save failed; IndexedDB draft remains available',
  }
  const scopedHistoryLabel = (isStudioScopedHistoryEnabled() || isStudioDurableScopedSaveEnabled()) && scopedHistoryStatus !== 'disabled'
    ? scopedHistoryLabels[scopedHistoryStatus]
    : null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        color: status.color,
        fontWeight: 500,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.color, flexShrink: 0 }} />
      <span>{status.label}</span>
      {status.detail && (
        <span
          data-testid="save-status-detail"
          style={{ fontWeight: 400, maxWidth: 360, color: 'var(--navi-text-secondary)' }}
        >
          {status.detail}
        </span>
      )}
      {scopedHistoryLabel && (
        <span
          data-testid="scoped-history-status"
          title={scopedHistoryDetail ?? undefined}
          style={{ fontWeight: 400, color: 'var(--navi-text-secondary)' }}
        >
          {scopedHistoryLabel}
        </span>
      )}
    </div>
  )
}
