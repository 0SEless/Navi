import type { NavigationGraphFile } from '@navi/core'
import type { ArtifactValidator } from '../artifact-hydrator'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const graphValidator: ArtifactValidator<NavigationGraphFile> = {
  artifactType: 'graph',
  supportedSchemaVersion: '1.0',
  validate(data: unknown): data is NavigationGraphFile {
    if (!isRecord(data)) return false
    if (typeof data.campusId !== 'string' || data.campusId.length === 0) return false
    if (!Array.isArray(data.nodes)) return false
    if (!Array.isArray(data.edges)) return false
    return true
  },
}
