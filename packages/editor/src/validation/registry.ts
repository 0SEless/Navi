import type { CampusDocument } from '@navi/core'
import { BaseEditorService } from '../context'

export type ValidationScope = 'entity' | 'building' | 'campus'

export type ValidationSeverity = 'error' | 'warning' | 'info'

export type ValidationCategory = 'geometry' | 'duplicate' | 'connectivity' | 'metadata' | 'reference'

export type ValidationIssueScope = 'entity' | 'building' | 'floor' | 'campus'

export type CampusEntityType =
  | 'building' | 'floor' | 'room' | 'hallway'
  | 'staircase' | 'elevator' | 'entrance' | 'road'
  | 'panorama' | 'checkpoint'

export interface ValidationLocation {
  type: 'polygon' | 'edge' | 'vertex' | 'point' | 'centroid'
  index?: number
}

export interface ValidationIssue {
  id: string
  severity: ValidationSeverity
  category: ValidationCategory
  scope: ValidationIssueScope
  entityId: string | null
  entityType: CampusEntityType | null
  message: string
  fixable: boolean
  location?: ValidationLocation
  validatorId: string
}

export interface ValidatorPlugin {
  id: string
  label: string
  scope: ValidationScope
  cost: 'cheap' | 'expensive'
  validate(document: CampusDocument): ValidationIssue[]
}

export type ValidatorGroup = 'editor' | 'publish'

export class ValidationRegistry extends BaseEditorService {
  readonly id = 'validation'
  readonly dependencies: readonly string[] = []

  private editorPlugins = new Map<string, ValidatorPlugin>()
  private publishPlugins = new Map<string, ValidatorPlugin>()

  register(plugin: ValidatorPlugin, group: ValidatorGroup = 'editor'): void {
    const map = group === 'editor' ? this.editorPlugins : this.publishPlugins
    if (map.has(plugin.id)) {
      throw new Error(`Validator already registered: ${plugin.id} (group: ${group})`)
    }
    map.set(plugin.id, plugin)
  }

  unregister(id: string): void {
    this.editorPlugins.delete(id)
    this.publishPlugins.delete(id)
  }

  get(id: string): ValidatorPlugin | undefined {
    return this.editorPlugins.get(id) ?? this.publishPlugins.get(id)
  }

  validateAll(document: CampusDocument, group: ValidatorGroup = 'editor'): ValidationIssue[] {
    const plugins = group === 'publish'
      ? this.publishPlugins
      : this.editorPlugins
    return this.runValidators(plugins, document)
  }

  get editorValidators(): ValidatorPlugin[] {
    return Array.from(this.editorPlugins.values())
  }

  get publishValidators(): ValidatorPlugin[] {
    return Array.from(this.publishPlugins.values())
  }

  get all(): ValidatorPlugin[] {
    return [...this.editorValidators, ...this.publishValidators]
  }

  get size(): number {
    return this.editorPlugins.size + this.publishPlugins.size
  }

  private runValidators(plugins: Map<string, ValidatorPlugin>, document: CampusDocument): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    for (const plugin of plugins.values()) {
      try {
        const results = plugin.validate(document)
        issues.push(...results)
      } catch (e) {
        issues.push({
          id: `system:crash:${hash(plugin.id)}`,
          severity: 'error',
          category: 'reference',
          scope: 'campus',
          entityId: null,
          entityType: null,
          message: `Validator "${plugin.id}" crashed: ${e}`,
          fixable: false,
          validatorId: 'system',
        })
      }
    }
    return issues
  }
}

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36)
}
