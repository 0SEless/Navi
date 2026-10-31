export type StudioSaveState = 'idle' | 'saving' | 'saved' | 'error' | 'dirty' | 'dirty-while-saving'
export type StudioGraphSyncStatus = 'idle' | 'syncing' | 'checking' | 'synced' | 'error' | 'conflict'
export type StudioLocalDraftStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'recovered' | 'conflict' | 'error'

export interface SaveStatusModelInput {
  saveState: StudioSaveState
  syncStatus: StudioGraphSyncStatus
  syncError?: string | null
  saveError?: string | null
  localDraftMode?: boolean
  localDraftStatus?: StudioLocalDraftStatus
  localDraftError?: string | null
}

export interface SaveStatusModel {
  label: string
  color: string
  detail: string | null
  showRecoveryActions: boolean
  /**
   * Raw producer text (syncError/saveError). Never shown in the main banner;
   * rendered only inside the advanced recovery disclosure.
   */
  diagnostic: string | null
}

const COLORS = {
  success: '#16a34a',
  progress: '#2563eb',
  warning: '#d97706',
  error: '#dc2626',
  neutral: '#64748b',
} as const

const CONFLICT_DETAIL =
  'This device contains changes that could not be synchronized because the server version changed. Your local work is preserved.'
const OFFLINE_DETAIL =
  'You appear to be offline. Your work is saved on this device and will sync automatically.'
const FAILURE_DETAIL =
  'Saving failed. Your local changes are preserved; retry when the server is reachable.'

export function getSaveStatusModel({
  saveState,
  syncStatus,
  syncError = null,
  saveError = null,
  localDraftMode = false,
  localDraftStatus = 'idle',
  localDraftError = null,
}: SaveStatusModelInput): SaveStatusModel {
  const diagnostic = syncError ?? saveError ?? null

  if (localDraftMode) {
    if (localDraftStatus === 'conflict') {
      return {
        label: 'Local draft needs review',
        color: COLORS.warning,
        detail: 'This draft is preserved on this device, but its known server base changed. Review the server version before Cloud Save.',
        showRecoveryActions: true,
        diagnostic: localDraftError,
      }
    }
    if (localDraftStatus === 'error') {
      return {
        label: 'Local save failed — changes preserved in memory',
        color: COLORS.error,
        detail: 'IndexedDB could not confirm this draft. Keep this tab open and retry local saving before leaving.',
        showRecoveryActions: true,
        diagnostic: localDraftError,
      }
    }
    if (localDraftStatus === 'saving') {
      return { label: 'Saving locally…', color: COLORS.progress, detail: null, showRecoveryActions: false, diagnostic: null }
    }
    if (localDraftStatus === 'dirty') {
      return { label: 'Unsaved local changes', color: COLORS.warning, detail: null, showRecoveryActions: false, diagnostic: null }
    }
    if (syncStatus === 'syncing') {
      return {
        label: 'Saved locally; syncing to cloud…',
        color: COLORS.progress,
        detail: 'The recoverable local draft is saved. The manual cloud save is still in progress.',
        showRecoveryActions: false,
        diagnostic: null,
      }
    }
    if (syncStatus === 'error' || syncStatus === 'conflict') {
      return {
        label: syncStatus === 'conflict' ? 'Cloud save needs conflict review' : 'Cloud save failed; local draft is safe',
        color: syncStatus === 'conflict' ? COLORS.warning : COLORS.error,
        detail: 'The local draft is preserved on this device; cloud synchronization needs attention.',
        showRecoveryActions: true,
        diagnostic,
      }
    }
    if (localDraftStatus === 'saved' || localDraftStatus === 'recovered') {
      return {
        label: syncStatus === 'synced' ? 'Saved locally and to cloud' : 'Saved locally',
        color: COLORS.success,
        detail: syncStatus === 'synced'
          ? 'The server acknowledged this version, and a recoverable copy remains on this device.'
          : 'This draft is stored on this device. It has not been saved to the cloud.',
        showRecoveryActions: false,
        diagnostic: null,
      }
    }
    if (saveState === 'dirty' || saveState === 'dirty-while-saving') {
      return { label: 'Unsaved local changes', color: COLORS.warning, detail: null, showRecoveryActions: false, diagnostic: null }
    }
    return {
      label: 'Local draft enabled',
      color: COLORS.neutral,
      detail: 'Cloud Save is separate; local changes will be saved to this device as you edit.',
      showRecoveryActions: false,
      diagnostic: null,
    }
  }

  if (syncStatus === 'conflict') {
    return {
      label: 'Changes not synced',
      color: COLORS.error,
      detail: CONFLICT_DETAIL,
      showRecoveryActions: true,
      diagnostic,
    }
  }

  if (syncStatus === 'error') {
    if (syncError?.startsWith('Offline')) {
      return {
        label: 'Saved on this device',
        color: COLORS.warning,
        detail: OFFLINE_DETAIL,
        showRecoveryActions: false,
        diagnostic,
      }
    }

    return {
      label: 'Save failed — changes preserved',
      color: COLORS.error,
      detail: FAILURE_DETAIL,
      showRecoveryActions: true,
      diagnostic,
    }
  }

  if (syncStatus === 'checking') {
    return {
      label: 'Checking server…',
      color: COLORS.neutral,
      detail: null,
      showRecoveryActions: false,
      diagnostic: null,
    }
  }

  if (syncStatus === 'syncing' || saveState === 'saving' || saveState === 'dirty-while-saving') {
    return {
      label: 'Saving...',
      color: COLORS.progress,
      detail: null,
      showRecoveryActions: false,
      diagnostic: null,
    }
  }

  if (saveState === 'error') {
    return {
      label: 'Save failed — changes preserved',
      color: COLORS.error,
      detail: FAILURE_DETAIL,
      showRecoveryActions: false,
      diagnostic,
    }
  }

  if (saveState === 'dirty') {
    return {
      label: 'Unsaved changes',
      color: COLORS.warning,
      detail: null,
      showRecoveryActions: false,
      diagnostic: null,
    }
  }

  if (syncStatus === 'idle') {
    return {
      label: 'Sync pending...',
      color: COLORS.neutral,
      detail: null,
      showRecoveryActions: false,
      diagnostic: null,
    }
  }

  return {
    label: 'All changes saved',
    color: COLORS.success,
    detail: null,
    showRecoveryActions: false,
    diagnostic: null,
  }
}
