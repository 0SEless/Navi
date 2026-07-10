import type { CampusDocument } from '@navi/core'
import type { ValidationIssue, ValidationScope, ValidatorPlugin } from './registry'
import { ValidationRegistry } from './registry'

// ─── Scope Context ────────────────────────────────────────────────

export interface EntityScopeContext {
  entityId: string
}

export interface BuildingScopeContext {
  buildingId: string
}

export type ScopeContext = EntityScopeContext | BuildingScopeContext

// ─── ScopeRouter ──────────────────────────────────────────────────

export class ScopeRouter {
  /**
   * Filter rules to only those that can operate at the given scope.
   * A rule with scope 'entity' is valid at entity, building, or campus scope.
   * A rule with scope 'building' is valid at building or campus scope.
   * A rule with scope 'campus' is valid only at campus scope.
   */
  static filterRules(rules: ValidatorPlugin[], scope: ValidationScope): ValidatorPlugin[] {
    switch (scope) {
      case 'entity':
        return rules.filter(r => r.scope === 'entity')
      case 'building':
        return rules.filter(r => r.scope === 'entity' || r.scope === 'building')
      case 'campus':
        return rules // all rules run at campus scope
    }
  }

  /** Collect all entity IDs from a document that belong to a specific building. */
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

  /** Collect ALL entity IDs from a document. */
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

  /** Find which building an entity belongs to, or null if top-level. */
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

// ─── ValidationEngine ─────────────────────────────────────────────

export class ValidationEngine {
  constructor(private registry: ValidationRegistry) {}

  /**
   * Run all validators at campus scope.
   * Produces identical results to ValidationRegistry.validateAll().
   */
  validateAll(document: CampusDocument): ValidationIssue[] {
    return this.registry.validateAll(document)
  }

  /**
   * Run entity-scoped validators and return only issues for the given entity.
   * Runs entity-level checks only (no cross-entity validators).
   */
  validateEntity(document: CampusDocument, entityId: string): ValidationIssue[] {
    const rules = ScopeRouter.filterRules(this.registry.all, 'entity')
    const issues: ValidationIssue[] = []
    for (const rule of rules) {
      try {
        const results = rule.validate(document)
        issues.push(...results.filter(i => i.entityId === entityId))
      } catch (e) {
        issues.push({
          severity: 'error',
          message: `Validator "${rule.id}" crashed: ${e}`,
          validatorId: 'system',
        })
      }
    }
    return issues
  }

  /**
   * Run validators at a specific scope, optionally filtered to a building or entity context.
   */
  validateScope(
    document: CampusDocument,
    scope: ValidationScope,
    context?: ScopeContext,
  ): ValidationIssue[] {
    // Campus scope: run everything unfiltered
    if (scope === 'campus') {
      return this.registry.validateAll(document)
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
          severity: 'error',
          message: `Validator "${rule.id}" crashed: ${e}`,
          validatorId: 'system',
        })
      }
    }

    return allIssues
  }
}
