'use client'

import { useState } from 'react'
import { useWorkflow } from '@navi/editor'
import { useGraphStore } from '@/store/graph-store'
import { getSaveStatusModel } from './save-status-model'

export function SaveStatus() {
  const { snapshot } = useWorkflow()
  const syncStatus = useGraphStore((state) => state.syncStatus)
  const syncError = useGraphStore((state) => state.syncError)
  const adoptServerSnapshot = useGraphStore((state) => state.adoptServerSnapshot)
  const reSync = useGraphStore((state) => state.reSync)
  const [showConflictReview, setShowConflictReview] = useState(false)
  const [showAdvancedRecovery, setShowAdvancedRecovery] = useState(false)
  const [showForceConfirmation, setShowForceConfirmation] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const status = getSaveStatusModel({
    saveState: snapshot.saveState,
    syncStatus,
    syncError,
    saveError: snapshot.saveError,
  })

  const runRecoveryAction = (action: () => Promise<void>) => {
    setActionError(null)
    void action().catch((error: unknown) => {
      setActionError(error instanceof Error ? error.message : 'Recovery action failed')
    })
  }

  return (
    <div role="status" aria-live="polite" style={{
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 5,
      fontSize: 11,
      color: status.color,
      fontWeight: 500,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: status.color,
          flexShrink: 0,
        }} />
        {status.label}
      </span>

      {status.detail && (
        <span data-testid="save-status-detail" style={{ fontWeight: 400, maxWidth: 360 }}>
          {status.detail}
        </span>
      )}

      {status.showRecoveryActions && (
        <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => setShowConflictReview((visible) => !visible)}
          >
            Review conflict
          </button>
          <button
            type="button"
            onClick={() => runRecoveryAction(adoptServerSnapshot)}
            title="Back up local changes, then load the server version"
          >
            Load server version
          </button>
          <button
            type="button"
            aria-expanded={showAdvancedRecovery}
            onClick={() => setShowAdvancedRecovery((visible) => !visible)}
          >
            Advanced recovery
          </button>
        </span>
      )}

      {showConflictReview && (
        <span role="region" aria-label="Conflict details" style={{ fontWeight: 400, maxWidth: 420 }}>
          Compare the preserved local graph with the server snapshot before choosing a recovery action. Force overwrite replaces the server version and is never automatic.
        </span>
      )}

      {status.showRecoveryActions && showAdvancedRecovery && (
        <span role="region" aria-label="Advanced recovery" style={{
          display: 'grid',
          gap: 5,
          justifyItems: 'center',
          fontWeight: 400,
          maxWidth: 420,
        }}>
          {status.diagnostic && (
            <span data-testid="save-status-diagnostic" style={{ fontSize: 10, maxWidth: 420, wordBreak: 'break-word' }}>
              {status.diagnostic}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setActionError(null)
              setShowForceConfirmation(true)
            }}
          >
            Force overwrite
          </button>
        </span>
      )}

      {actionError && (
        <span role="alert" style={{ fontWeight: 400, maxWidth: 360 }}>
          {actionError}
        </span>
      )}

      {showForceConfirmation && (
        <div role="dialog" aria-modal="true" aria-label="Confirm force overwrite" style={{
          display: 'grid',
          gap: 5,
          padding: 8,
          color: '#0f172a',
          background: '#fff',
          border: '1px solid #cbd5e1',
          borderRadius: 4,
          fontWeight: 400,
        }}>
          <strong>Force overwrite server map?</strong>
          <span>This replaces the server snapshot with the current local graph. Confirm only after reviewing the conflict and creating backups.</span>
          <span style={{ display: 'inline-flex', gap: 4, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowForceConfirmation(false)}>Cancel</button>
            <button
              type="button"
              onClick={() => {
                setShowForceConfirmation(false)
                runRecoveryAction(() => reSync({ force: true }))
              }}
            >
              Confirm force overwrite
            </button>
          </span>
        </div>
      )}
    </div>
  )
}
