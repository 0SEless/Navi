import type { CampusDocument } from '@navi/core'
import type { ValidationIssue, ValidationScope, ValidatorPlugin, ValidatorGroup } from './registry'
import { ValidationRegistry } from './registry'

export interface EntityScopeContext {
  entityId: string
}

export interface BuildingScopeContext {
  buildingId: string
}

export type ScopeContext = EntityScopeContext | BuildingScopeContext

export class ScopeRouter {
  static filterRules(rules: ValidatorPlugin[], scope: ValidationScope): ValidatorPlugin[] {
    switch (scope) {
      case 'entity':
        return rules.filter(r => r.scope === 'entity')
      case 'building':
        return rules.filter(r => r.scope === 'entity' || r.scope === 'building')
      case 'campus':
        return rules
    }
  }

  static getBuildingEntityIds(document: CampusDocument, buildingId: string): string[] {
    const ids: string[] = []
    for (const bld of document.buildings) {
      if (bld.id !== buildingId) continue
      ids.push(bld.id)
      for (const floor of bld.floors) {
        ids.push(floor.id)
        for (const room of floor.rooms) ids.push(room.id)
        for (const hw of floor.hallways) ids.push(hw.id)
        for (const st of floor.staircases) ids.push(st.id)
        for (const el of floor.elevators) ids.push(el.id)
        for (const ent of floor.entrances) ids.push(ent.id)
      }
    }
    return ids
  }

  static getAllEntityIds(document: CampusDocument): string[] {
    const ids: string[] = []
    for (const bld of document.buildings) {
      ids.push(bld.id)
      for (const floor of bld.floors) {
        ids.push(floor.id)
        for (const room of floor.rooms) ids.push(room.id)
        for (const hw of floor.hallways) ids.push(hw.id)
        for (const st of floor.staircases) ids.push(st.id)
        for (const el of floor.elevators) ids.push(el.id)
        for (const ent of floor.entrances) ids.push(ent.id)
      }
    }
    for (const road of document.roads) ids.push(road.id)
    for (const pano of document.panoramas) ids.push(pano.id)
    for (const qr of document.qrCheckpoints) ids.push(qr.id)
    return ids
  }

  static resolveBuilding(document: CampusDocument, entityId: string): string | null {
    for (const bld of document.buildings) {
      if (bld.id === entityId) return bld.id
      for (const floor of bld.floors) {
        if (floor.id === entityId) return bld.id
        for (const room of floor.rooms) if (room.id === entityId) return bld.id
        for (const hw of floor.hallways) if (hw.id === entityId) return bld.id
        for (const st of floor.staircases) if (st.id === entityId) return bld.id
        for (const el of floor.elevators) if (el.id === entityId) return bld.id
        for (const ent of floor.entrances) if (ent.id === entityId) return bld.id
      }
    }
    return null
  }
}

export class ValidationEngine {
  constructor(private registry: ValidationRegistry) {}

  validateAll(document: CampusDocument, group?: ValidatorGroup): ValidationIssue[] {
    return this.registry.validateAll(document, group)
  }

  validateEntity(document: CampusDocument, entityId: string): ValidationIssue[] {
    const rules = ScopeRouter.filterRules(this.registry.editorValidators, 'entity')
    const issues: ValidationIssue[] = []
    for (const rule of rules) {
      try {
        const results = rule.validate(document)
        issues.push(...results.filter(i => i.entityId === entityId))
      } catch (e) {
        issues.push({
          id: `system:crash:${hash(rule.id)}`,
          severity: 'error',
          category: 'reference',
          scope: 'campus',
          entityId: null,
          entityType: null,
          message: `Validator "${rule.id}" crashed: ${e}`,
          fixable: false,
          validatorId: 'system',
        })
      }
    }
    return issues
  }

  validateScope(
    document: CampusDocument,
    scope: ValidationScope,
    context?: ScopeContext,
  ): ValidationIssue[] {
    if (scope === 'campus') {
      return this.registry.validateAll(document, 'editor')
    }

    const rules = ScopeRouter.filterRules(this.registry.all, scope)
    const allIssues: ValidationIssue[] = []

    for (const rule of rules) {
      try {
        const results = rule.validate(document)
        if (scope === 'entity' && context && 'entityId' in context) {
          allIssues.push(...results.filter(i => i.entityId === context.entityId))
        } else if (scope === 'building' && context && 'buildingId' in context) {
          const buildingIds = new Set(
            ScopeRouter.getBuildingEntityIds(document, context.buildingId),
          )
          allIssues.push(...results.filter(i => i.entityId && buildingIds.has(i.entityId)))
        } else {
          allIssues.push(...results)
        }
      } catch (e) {
        allIssues.push({
          id: `system:crash:${hash(rule.id)}`,
          severity: 'error',
          category: 'reference',
          scope: 'campus',
          entityId: null,
          entityType: null,
          message: `Validator "${rule.id}" crashed: ${e}`,
          fixable: false,
          validatorId: 'system',
        })
      }
    }

    return allIssues
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
