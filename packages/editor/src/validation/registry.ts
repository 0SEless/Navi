import type { CampusDocument } from '@navi/core'
import { BaseEditorService } from '../context'

export type ValidationScope = 'entity' | 'building' | 'campus'

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  entityId?: string
  message: string
  validatorId: string
}

export interface ValidatorPlugin {
  id: string
  label: string
  /** Minimum scope needed for this validator to produce meaningful results.
   *  'entity': checks properties of a single entity (e.g., polygon closure).
   *  'building': checks relationships within a building (e.g., room overlap).
   *  'campus': needs the full document (e.g., duplicate IDs across all buildings). */
  scope: ValidationScope
  validate(document: CampusDocument): ValidationIssue[]
}

export class ValidationRegistry extends BaseEditorService {
  readonly id = 'validation'
  readonly dependencies: readonly string[] = []

  private plugins = new Map<string, ValidatorPlugin>()

  register(plugin: ValidatorPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Validator already registered: ${plugin.id}`)
    }
    this.plugins.set(plugin.id, plugin)
  }

  unregister(id: string): void {
    this.plugins.delete(id)
  }

  get(id: string): ValidatorPlugin | undefined {
    return this.plugins.get(id)
  }

  validateAll(document: CampusDocument): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    for (const plugin of this.plugins.values()) {
      try {
        const results = plugin.validate(document)
        issues.push(...results)
      } catch (e) {
        issues.push({
          severity: 'error',
          message: `Validator "${plugin.id}" crashed: ${e}`,
          validatorId: 'system',
        })
      }
    }
    return issues
  }

  get all(): ValidatorPlugin[] {
    return Array.from(this.plugins.values())
  }

  get size(): number {
    return this.plugins.size
  }
}
