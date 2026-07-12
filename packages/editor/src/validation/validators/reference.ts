import type { CampusDocument } from '@navi/core'
import type { ValidatorPlugin, ValidationIssue } from '../registry'

export const referenceValidator: ValidatorPlugin = {
  id: 'reference',
  label: 'Reference Validator',
  scope: 'campus',
  cost: 'cheap',
  validate(_document: CampusDocument): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    // All nesting relationships are verified by the document structure.
    // This is a placeholder for future cross-document references.
    // Currently nothing to validate since all references are structural.
    return issues
  },
}
