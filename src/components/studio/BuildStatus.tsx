'use client'

import { useWorkflow, useEditor } from '@navi/editor'
import { useEffect, useState } from 'react'
import { SAVE_FIRST } from '@/studio-v2/client/studio-session'
import { useStudioSession, useStudioSessionState } from './v2/useStudioSession'

export interface BuildStatusProps {
  onOpenProblems?: () => void
  problemCount?: number
}

export function BuildStatus({ onOpenProblems, problemCount = 0 }: BuildStatusProps) {
  const { services } = useEditor()
  const { percent, validate, snapshot } = useWorkflow()
  const publishService = services.get('publish') as {
    getSnapshot: () => { publishState: string; publishError: string | null }
    subscribe: (l: () => void) => () => void
    publish: (force?: boolean) => Promise<void>
  } | null
  const [publishState, setPublishState] = useState('idle')
  // Save v2: publishing takes the latest saved commit, so unsaved work must be saved first.
  const v2Session = useStudioSession()
  const saveFirst = useStudioSessionState(v2Session).dirty

  useEffect(() => {
    if (!publishService?.subscribe) return
    const update = () => setPublishState(publishService.getSnapshot().publishState)
    update()
    return publishService.subscribe(update)
  }, [publishService])

  // Owner decision (R70): warnings never block publishing; errors still do.
  const lastValidation = snapshot?.lastValidation ?? null
  const errorCount = lastValidation?.errors.length ?? 0
  const warningCount = lastValidation ? Math.max(0, lastValidation.failed - errorCount) : 0
  const errors = errorCount > 0
  const isReady = lastValidation !== null && !errors
  const isPublished = publishState === 'success'

  const statusColor = errors ? '#dc2626' : isReady ? (warningCount > 0 ? '#d97706' : '#16a34a') : '#9ca3af'
  const statusLabel = errors ? 'Issues Found' : isReady ? (warningCount > 0 ? 'Ready with warnings' : 'Build Ready') : 'Not Validated'

  const startPublish = () => {
    if (warningCount > 0) {
      const plural = warningCount === 1 ? '' : 's'
      if (!window.confirm(`${warningCount} warning${plural} found (see View issues). Publish anyway?`)) return
    }
    void publishService?.publish().catch(() => undefined)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 600, color: statusColor,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        {statusLabel}
      </span>
      {percent > 0 && percent < 100 && (
        <span style={{ fontSize: 10, color: '#6b7280' }}>{percent}%</span>
      )}
      <button onClick={() => void validate()}
        style={{
          padding: '2px 10px', fontSize: 11, fontWeight: 600,
          border: '1px solid var(--navi-border)', borderRadius: 4,
          background: 'transparent', color: 'var(--navi-text)', cursor: 'pointer',
        }}
      >Validate</button>
      {onOpenProblems && (
        <button onClick={onOpenProblems}
          style={{
            padding: '2px 10px', fontSize: 11, fontWeight: 600,
            border: `1px solid ${problemCount > 0 ? '#d97706' : 'var(--navi-border)'}`,
            borderRadius: 4,
            background: 'transparent',
            color: problemCount > 0 ? '#d97706' : 'var(--navi-text)',
            cursor: 'pointer',
          }}
        >{problemCount > 0 ? `⚠ View issues (${problemCount})` : 'View issues'}</button>
      )}
      <button onClick={startPublish}
        disabled={!isReady || saveFirst || publishState === 'compiling' || publishState === 'uploading'}
        title={saveFirst ? SAVE_FIRST : undefined}
        style={{
          padding: '2px 10px', fontSize: 11, fontWeight: 600,
          border: '1px solid var(--navi-primary)', borderRadius: 4,
          background: isPublished ? 'var(--navi-primary)' : 'transparent',
          color: isPublished ? 'white' : 'var(--navi-primary)',
          cursor: publishState === 'compiling' ? 'not-allowed' : 'pointer',
        }}
      >
        {saveFirst ? SAVE_FIRST :
         publishState === 'success' ? 'Published' :
         publishState === 'error' ? 'Failed' :
         publishState === 'compiling' ? 'Compiling...' :
         publishState === 'uploading' ? 'Uploading...' : 'Publish'}
      </button>
    </div>
  )
}
