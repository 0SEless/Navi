import type { ValidationIssue } from '../../validation/registry'

export interface ValidationSummary {
  total: number
  errors: number
  warnings: number
  infos: number
}

export interface ValidationStoreSnapshot {
  version: number
  issues: ValidationIssue[]
  summary: ValidationSummary
  lastValidatedRevision: number
  lastValidationTimestamp: number
  runningRevision: number | null
  isValid: boolean
  pending: boolean
}

export class ValidationStore {
  private _version = 0
  private _issues: ValidationIssue[] = []
  private _lastValidatedRevision = 0
  private _lastValidationTimestamp = 0
  private _runningRevision: number | null = null
  private _pending = false

  private listeners = new Set<() => void>()
  private cachedSnapshot: ValidationStoreSnapshot | null = null

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot(): ValidationStoreSnapshot {
    if (!this.cachedSnapshot || this.cachedSnapshot.version !== this._version) {
      const summary = computeSummary(this._issues)
      this.cachedSnapshot = Object.freeze({
        version: this._version,
        issues: this._issues,
        summary,
        lastValidatedRevision: this._lastValidatedRevision,
        lastValidationTimestamp: this._lastValidationTimestamp,
        runningRevision: this._runningRevision,
        isValid: summary.errors === 0,
        pending: this._pending,
      })
    }
    return this.cachedSnapshot
  }

  commit(update: {
    issues: ValidationIssue[]
    lastValidatedRevision: number
    runningRevision?: number | null
    pending?: boolean
  }): void {
    this._issues = update.issues
    this._lastValidatedRevision = update.lastValidatedRevision
    this._lastValidationTimestamp = Date.now()
    if (update.runningRevision !== undefined) this._runningRevision = update.runningRevision
    if (update.pending !== undefined) this._pending = update.pending
    this._version++
    this.cachedSnapshot = null
    this.listeners.forEach((l) => l())
  }

  setPending(pending: boolean): void {
    this._pending = pending
    this._version++
    this.cachedSnapshot = null
    this.listeners.forEach((l) => l())
  }

  setRunningRevision(revision: number | null): void {
    this._runningRevision = revision
    this._version++
    this.cachedSnapshot = null
    this.listeners.forEach((l) => l())
  }
}

function computeSummary(issues: ValidationIssue[]): ValidationSummary {
  let errors = 0, warnings = 0, infos = 0
  for (const issue of issues) {
    if (issue.severity === 'error') errors++
    else if (issue.severity === 'warning') warnings++
    else infos++
  }
  return { total: issues.length, errors, warnings, infos }
}
