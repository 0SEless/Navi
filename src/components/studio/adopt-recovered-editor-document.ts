import type { CampusDocument } from '@navi/core'
import type { EditorContext } from '@navi/editor'

interface RecoveredDraftState {
  localDraftRecoveryStatus: string
  authoredDocument: CampusDocument | null
}

/** Keep the editor document aligned with a verified IndexedDB recovery. */
export function adoptRecoveredEditorDocument(context: EditorContext, state: RecoveredDraftState): boolean {
  if (state.localDraftRecoveryStatus !== 'recovered' && state.localDraftRecoveryStatus !== 'conflict') return false
  const snapshot = state.authoredDocument
  const campusId = context.document.metadata?.campusId
  if (!snapshot || !campusId || snapshot.metadata?.campusId !== campusId) return false

  const documentStore = context.services.get('documentStore') as { adoptSnapshot?: (document: CampusDocument) => void } | undefined
  if (typeof documentStore?.adoptSnapshot !== 'function') return false
  documentStore.adoptSnapshot(snapshot)
  return true
}
