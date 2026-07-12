export { ValidationRegistry } from './registry'
export type {
  ValidationIssue, ValidationScope, ValidationSeverity, ValidationCategory,
  ValidationIssueScope, CampusEntityType, ValidationLocation,
  ValidatorPlugin, ValidatorGroup,
} from './registry'
export { ValidationEngine, ScopeRouter } from './engine'
export type { ScopeContext, EntityScopeContext, BuildingScopeContext } from './engine'
export { polygonClosureValidator, selfIntersectionValidator, duplicateIdsValidator } from './validators'
