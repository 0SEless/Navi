'use client'

import { useWorkflow } from '@navi/editor'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  saved: { label: 'All changes saved', color: '#16a34a' },
  idle: { label: 'All changes saved', color: '#16a34a' },
  saving: { label: 'Saving...', color: '#2563eb' },
  dirty: { label: 'Unsaved changes', color: '#d97706' },
  'dirty-while-saving': { label: 'Unsaved changes', color: '#d97706' },
  error: { label: 'Save failed', color: '#dc2626' },
}

export function SaveStatus() {
  const { snapshot } = useWorkflow()
  const status = STATUS_MAP[snapshot.saveState] ?? STATUS_MAP.saved

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 11,
      color: status.color,
      fontWeight: 500,
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: status.color,
        flexShrink: 0,
      }} />
      {status.label}
    </span>
  )
}
