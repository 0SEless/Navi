import type { CampusDocument } from '@navi/core'
import type { ServiceRegistry, ToolContext } from '@navi/editor'

const REQUIRED_TOOL_SERVICES = ['dispatcher', 'viewport', 'selection'] as const

/** Build the service shape expected by editor tools from the editor's registry. */
export function createFloorEditorToolContext(
  registry: ServiceRegistry,
  document: CampusDocument,
): ToolContext {
  const missing = REQUIRED_TOOL_SERVICES.filter((serviceId) => !registry.has(serviceId))
  if (missing.length > 0) {
    throw new Error(`Floor Editor tool context is missing required services: ${missing.join(', ')}`)
  }

  return { services: registry.typed, document }
}
