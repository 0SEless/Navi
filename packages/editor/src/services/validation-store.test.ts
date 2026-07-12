import { describe, it, expect, vi } from 'vitest'
import { ValidationStore } from './validation-store'
import type { ValidationIssue } from '../../validation/registry'

describe('ValidationStore', () => {
  it('initial snapshot has empty issues and zero counts', () => {
    const store = new ValidationStore()
    const snap = store.getSnapshot()
    expect(snap.issues).toEqual([])
    expect(snap.summary).toEqual({ total: 0, errors: 0, warnings: 0, infos: 0 })
    expect(snap.isValid).toBe(true)
    expect(snap.pending).toBe(false)
    expect(snap.lastValidatedRevision).toBe(0)
    expect(snap.runningRevision).toBeNull()
  })

  it('commit updates snapshot and increments version', () => {
    const store = new ValidationStore()
    const issues: ValidationIssue[] = [
      { id: 'v1', severity: 'error', category: 'geometry', scope: 'entity', entityId: 'bld-1', entityType: 'building', message: 'Bad polygon', fixable: false, validatorId: 'polygon-closure' },
      { id: 'v2', severity: 'warning', category: 'duplicate', scope: 'campus', entityId: null, entityType: null, message: 'Duplicate IDs', fixable: false, validatorId: 'duplicate-ids' },
      { id: 'v3', severity: 'info', category: 'metadata', scope: 'entity', entityId: 'bld-2', entityType: 'building', message: 'Info msg', fixable: false, validatorId: 'floor-metadata' },
    ]
    store.commit({ issues, lastValidatedRevision: 5 })

    const snap = store.getSnapshot()
    expect(snap.issues).toEqual(issues)
    expect(snap.summary).toEqual({ total: 3, errors: 1, warnings: 1, infos: 1 })
    expect(snap.isValid).toBe(false)
    expect(snap.lastValidatedRevision).toBe(5)
    expect(snap.version).toBe(1)
  })

  it('isValid is true when there are zero errors', () => {
    const store = new ValidationStore()
    store.commit({
      issues: [
        { id: 'v1', severity: 'warning', category: 'geometry', scope: 'entity', entityId: 'bld-1', entityType: 'building', message: 'Warning', fixable: false, validatorId: 'test' },
      ],
      lastValidatedRevision: 1,
    })
    expect(store.getSnapshot().isValid).toBe(true)
  })

  it('isValid is false when there are errors', () => {
    const store = new ValidationStore()
    store.commit({
      issues: [
        { id: 'v1', severity: 'error', category: 'geometry', scope: 'entity', entityId: 'bld-1', entityType: 'building', message: 'Error', fixable: false, validatorId: 'test' },
      ],
      lastValidatedRevision: 1,
    })
    expect(store.getSnapshot().isValid).toBe(false)
  })

  it('commit is atomic — replaces issues entirely', () => {
    const store = new ValidationStore()
    const issues1: ValidationIssue[] = [{ id: 'v1', severity: 'error', category: 'geometry', scope: 'entity', entityId: 'bld-1', entityType: 'building', message: 'Error', fixable: false, validatorId: 'test' }]
    store.commit({ issues: issues1, lastValidatedRevision: 1 })
    expect(store.getSnapshot().issues).toHaveLength(1)

    const issues2: ValidationIssue[] = []
    store.commit({ issues: issues2, lastValidatedRevision: 2 })
    expect(store.getSnapshot().issues).toHaveLength(0)
    expect(store.getSnapshot().isValid).toBe(true)
  })

  it('subscribe notifies on commit', () => {
    const store = new ValidationStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.commit({ issues: [], lastValidatedRevision: 1 })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('subscribe returns unsubscribe function', () => {
    const store = new ValidationStore()
    const listener = vi.fn()
    const unsub = store.subscribe(listener)
    unsub()
    store.commit({ issues: [], lastValidatedRevision: 1 })
    expect(listener).not.toHaveBeenCalled()
  })
})
