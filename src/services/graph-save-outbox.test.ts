import { beforeEach, describe, expect, it } from 'vitest'
import { Graph } from '../engine/graph'
import { fullSnapshotFingerprint } from './full-snapshot-identity'
import { clearGraphSaveOutbox, readGraphSaveOutbox, writeGraphSaveOutbox, type PendingGraphSave } from './graph-save-outbox'
const campus = 'outbox-unit'
function entry(): PendingGraphSave {
  const payload = { ...new Graph().toJSON(), campusId: campus, expectedServerUpdatedAt: 'R1', mutationId: 'mutation-1' }
  return { version: 1, campusId: campus, mutationId: payload.mutationId, contentFingerprint: fullSnapshotFingerprint(payload), expectedServerUpdatedAt: 'R1', body: JSON.stringify(payload), includedUpTo: 1, intentGeneration: 'generation', recovery: false }
}
describe('immutable browser save outbox', () => {
  beforeEach(() => localStorage.clear())
  it('roundtrips identity and only clears the accepted mutation', () => {
    const pending = entry(); writeGraphSaveOutbox(pending)
    expect(readGraphSaveOutbox(campus)).toEqual(pending)
    clearGraphSaveOutbox(campus, 'other')
    expect(readGraphSaveOutbox(campus)).toEqual(pending)
    clearGraphSaveOutbox(campus, pending.mutationId)
    expect(readGraphSaveOutbox(campus)).toBeNull()
  })
  it('cannot replace unresolved content with another logical request', () => {
    const pending = entry(); writeGraphSaveOutbox(pending)
    expect(() => writeGraphSaveOutbox({ ...pending, mutationId: 'new' })).toThrow(/unresolved/)
    expect(readGraphSaveOutbox(campus)).toEqual(pending)
  })
  it('preserves malformed or tampered bytes instead of silently overwriting them', () => {
    const pending = entry()
    const raw = JSON.stringify({ ...pending, contentFingerprint: 'wrong' })
    localStorage.setItem(`navi-graph-outbox-${campus}`, raw)
    expect(() => readGraphSaveOutbox(campus)).toThrow(/unreadable/)
    expect(() => writeGraphSaveOutbox(pending)).toThrow(/unreadable/)
    expect(localStorage.getItem(`navi-graph-outbox-${campus}`)).toBe(raw)
  })
})
