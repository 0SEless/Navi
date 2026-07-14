# Task 1: PublishStore

**Files:**
- Create: `packages/editor/src/services/publish-store.ts`
- Create: `packages/editor/src/services/__tests__/publish-store.test.ts`

**Interfaces:**
- Consumes: nothing (standalone store)
- Produces: `PublishStore` class, `PublishState` type, `PublishSnapshot` type, `PublishResult` type

## Steps

- [ ] **Step 1: Write the PublishStore source file**

```typescript
// packages/editor/src/services/publish-store.ts

export type PublishState = 'idle' | 'preparing' | 'validating' | 'compiling' | 'uploading' | 'success' | 'error'

export interface PublishResult {
  revision: number
  compiledGraphVersion: string
  campusId: string
  artifactCount: number
  nodeCount: number
  edgeCount: number
  startedAt: number
  finishedAt: number
}

export interface PublishSnapshot {
  version: number
  publishState: PublishState
  publishResult: PublishResult | null
  publishError: string | null
  currentStageStartedAt: number
  lastPublishedRevision: number
  lastPublishedAt: number
}

export class PublishStore {
  readonly dependencies: readonly string[] = []

  private _version = 0
  private _publishState: PublishState = 'idle'
  private _publishResult: PublishResult | null = null
  private _publishError: string | null = null
  private _currentStageStartedAt = 0
  private _lastPublishedRevision = 0
  private _lastPublishedAt = 0

  private listeners = new Set<() => void>()
  private cachedSnapshot: PublishSnapshot | null = null

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot(): PublishSnapshot {
    if (!this.cachedSnapshot || this.cachedSnapshot.version !== this._version) {
      this.cachedSnapshot = Object.freeze({
        version: this._version,
        publishState: this._publishState,
        publishResult: this._publishResult,
        publishError: this._publishError,
        currentStageStartedAt: this._currentStageStartedAt,
        lastPublishedRevision: this._lastPublishedRevision,
        lastPublishedAt: this._lastPublishedAt,
      })
    }
    return this.cachedSnapshot
  }

  updatePublishState(update: {
    publishState?: PublishState
    publishResult?: PublishResult | null
    publishError?: string | null
    currentStageStartedAt?: number
    lastPublishedRevision?: number
    lastPublishedAt?: number
  }): void {
    if (update.publishState !== undefined) this._publishState = update.publishState
    if (update.publishResult !== undefined) this._publishResult = update.publishResult
    if (update.publishError !== undefined) this._publishError = update.publishError
    if (update.currentStageStartedAt !== undefined) this._currentStageStartedAt = update.currentStageStartedAt
    if (update.lastPublishedRevision !== undefined) this._lastPublishedRevision = update.lastPublishedRevision
    if (update.lastPublishedAt !== undefined) this._lastPublishedAt = update.lastPublishedAt
    this._version++
    this.cachedSnapshot = null
    this.listeners.forEach((l) => l())
  }
}
```

- [ ] **Step 2: Write the PublishStore test**

```typescript
// packages/editor/src/services/__tests__/publish-store.test.ts
import { describe, it, expect } from 'vitest'
import { PublishStore } from '../publish-store'

describe('PublishStore', () => {
  it('initial snapshot is idle with no result', () => {
    const store = new PublishStore()
    const snap = store.getSnapshot()
    expect(snap.publishState).toBe('idle')
    expect(snap.publishResult).toBeNull()
    expect(snap.publishError).toBeNull()
    expect(snap.currentStageStartedAt).toBe(0)
    expect(snap.lastPublishedRevision).toBe(0)
    expect(snap.lastPublishedAt).toBe(0)
  })

  it('updatePublishState atomically updates fields', () => {
    const store = new PublishStore()
    store.updatePublishState({ publishState: 'preparing', currentStageStartedAt: 100 })
    const snap = store.getSnapshot()
    expect(snap.publishState).toBe('preparing')
    expect(snap.currentStageStartedAt).toBe(100)
  })

  it('notifies subscribers on update', () => {
    const store = new PublishStore()
    let called = 0
    const unsub = store.subscribe(() => { called++ })
    store.updatePublishState({ publishState: 'preparing' })
    expect(called).toBe(1)
    unsub()
    store.updatePublishState({ publishState: 'idle' })
    expect(called).toBe(1) // not incremented after unsubscribe
  })

  it('returns frozen immutable snapshot', () => {
    const store = new PublishStore()
    const snap = store.getSnapshot()
    expect(Object.isFrozen(snap)).toBe(true)
  })

  it('version increments on each update', () => {
    const store = new PublishStore()
    const v1 = store.getSnapshot().version
    store.updatePublishState({ publishState: 'preparing' })
    const v2 = store.getSnapshot().version
    expect(v2).toBe(v1 + 1)
  })

  it('cached snapshot is stable between updates', () => {
    const store = new PublishStore()
    const a = store.getSnapshot()
    const b = store.getSnapshot()
    expect(a).toBe(b) // same reference
  })
})
```

- [ ] **Step 3: Run store tests** `npx vitest run packages/editor/src/services/__tests__/publish-store.test.ts` — Expected: all pass

- [ ] **Step 4: Commit** `git add packages/editor/src/services/publish-store.ts packages/editor/src/services/__tests__/publish-store.test.ts` `git commit -m "feat(publish): add PublishStore with reactive state"`
