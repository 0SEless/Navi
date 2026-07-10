import type { CompileResult } from './navigation-compiler'

// ── Types ─────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success'

export interface ValidationResult {
  passed: number
  failed: number
  errors: string[]
  timestamp: number
}

export interface SaveRecord {
  timestamp: number
  reason: 'manual' | 'autosave'
}

export interface PublishRecord {
  timestamp: number
}

/**
 * Immutable snapshot returned by WorkflowStore.getSnapshot().
 * A new reference is created only when version changes.
 */
export interface WorkflowSnapshot {
  version: number
  lastValidation: ValidationResult | null
  lastCompile: CompileResult | null
  lastSave: SaveRecord | null
  lastPublish: PublishRecord | null
  syncStatus: SyncStatus
  lastSaveVersion: number
}

// ── WorkflowStore ─────────────────────────────────────────────

/**
 * Reactive state container for workflow orchestration.
 *
 * Follows the same pattern as DocumentStore (plain class with
 * subscribe/commit) but exposes getSnapshot() returning an
 * immutable snapshot object — aligning with useSyncExternalStore's
 * canonical API.
 *
 * INVARIANT: Only WorkflowService may call the set*() mutators.
 * UI code calls getSnapshot() only. This prevents accidental
 * state corruption and keeps data flow unidirectional.
 *
 * INVARIANT: WorkflowService is the ONLY public workflow API.
 * No UI code calls PersistenceService or NavigationCompiler
 * directly — always through WorkflowService.
 */
export class WorkflowStore {
  readonly dependencies: readonly string[] = []

  private _version = 0
  private _lastValidation: ValidationResult | null = null
  private _lastCompile: CompileResult | null = null
  private _lastSave: SaveRecord | null = null
  private _lastPublish: PublishRecord | null = null
  private _syncStatus: SyncStatus = 'idle'
  private _lastSaveVersion = 0

  private listeners = new Set<() => void>()
  private cachedSnapshot: WorkflowSnapshot | null = null

  // ── React subscription API ──────────────────────────────────

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Returns an immutable snapshot. The returned object reference
   * is stable between version changes — React uses referential
   * equality to bail out of re-renders.
   */
  getSnapshot(): WorkflowSnapshot {
    if (!this.cachedSnapshot || this.cachedSnapshot.version !== this._version) {
      this.cachedSnapshot = Object.freeze({
        version: this._version,
        lastValidation: this._lastValidation,
        lastCompile: this._lastCompile,
        lastSave: this._lastSave,
        lastPublish: this._lastPublish,
        syncStatus: this._syncStatus,
        lastSaveVersion: this._lastSaveVersion,
      })
    }
    return this.cachedSnapshot
  }

  // ── Mutators (WorkflowService only) ─────────────────────────

  setValidation(result: ValidationResult): void {
    this._lastValidation = result
    this.commit()
  }

  setCompile(result: CompileResult): void {
    this._lastCompile = result
    this.commit()
  }

  setSave(timestamp: number, reason: 'manual' | 'autosave'): void {
    this._lastSave = { timestamp, reason }
    this.commit()
  }

  setPublish(timestamp: number): void {
    this._lastPublish = { timestamp }
    this.commit()
  }

  setSyncStatus(status: SyncStatus): void {
    this._syncStatus = status
    this.commit()
  }

  setLastSaveVersion(version: number): void {
    this._lastSaveVersion = version
    // No commit needed — lastSaveVersion is read synchronously by isDirty()
  }

  // ── Internal ────────────────────────────────────────────────

  private commit(): void {
    this._version++
    this.cachedSnapshot = null
    this.listeners.forEach((l) => l())
  }
}
