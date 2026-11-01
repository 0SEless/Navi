// The editor's PersistenceAdapter under Save v2 (spec §6.2). Every WorkflowService save is
// a local draft write; only the admin's explicit Save (button / Ctrl+S, see
// `markExplicitSave`) reaches the network. Nothing here calls the legacy graph store.
import type { PersistenceAdapter, PersistenceSyncState } from '@navi/editor'
import type { StudioSession, StudioSessionState } from './studio-session'
import { outcomeMessage } from './studio-session'

function syncStateOf(state: StudioSessionState): PersistenceSyncState {
  switch (state.status) {
    case 'saving':
      return { status: 'syncing', error: null }
    case 'error':
      return { status: 'error', error: state.message }
    case 'conflict':
      return { status: 'conflict', error: state.message }
    default:
      // A clean tab is in sync with the saved head; a dirty one is waiting for Save.
      return state.dirty ? { status: 'idle', error: null } : { status: 'synced', error: null }
  }
}

async function explicitSave(session: StudioSession): Promise<void> {
  const outcome = await session.save()
  if (outcome.kind !== 'saved') throw new Error(outcomeMessage(outcome) ?? 'Save failed')
}

export function createV2PersistenceAdapter(session: StudioSession): PersistenceAdapter {
  return {
    async save() {
      if (session.consumeExplicitSave()) return explicitSave(session)
      await session.writeDraft()
    },
    syncToSupabase: () => explicitSave(session),
    publish: () => session.publish(),
    getSyncState: () => syncStateOf(session.getState()),
    subscribeSyncState: (listener) => session.subscribe((state) => listener(syncStateOf(state))),
  }
}

/** The explicit Save: the one path that sends parts to the server. */
export async function saveExplicitly(session: StudioSession, workflow: { save(reason: 'manual'): Promise<void> } | undefined): Promise<void> {
  session.markExplicitSave()
  if (workflow) {
    await workflow.save('manual')
    return
  }
  session.consumeExplicitSave()
  await explicitSave(session)
}
