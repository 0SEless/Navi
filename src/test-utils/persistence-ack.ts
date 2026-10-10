import { fullSnapshotFingerprint } from '../services/full-snapshot-identity'

/** Transport fixture representing the API's committed-content ACK. */
export function committedAck(payload: Record<string, unknown>, revision: string) {
  return { success: true, campus_id: payload.campusId, campusId: payload.campusId,
    mutationId: payload.mutationId, updatedAt: revision, committedRevision: revision,
    committedContentFingerprint: fullSnapshotFingerprint(payload) }
}
export function ackForRequest(init: RequestInit | undefined, revision: string) {
  return committedAck(JSON.parse(String(init?.body ?? '{}')), revision)
}
