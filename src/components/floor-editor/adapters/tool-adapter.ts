'use client'

import type { ToolRegistry } from '@navi/editor'
import type { StudioTool } from '@/types/studio-types'

const FLOOR_TOOL_IDS = new Set<string>(['select', 'room', 'entrance', 'stairs', 'elevator', 'hallway'])

function toStudioTool(id: string | null): StudioTool {
  if (id && FLOOR_TOOL_IDS.has(id)) return id as StudioTool
  return 'select'
}

function toRegistryTool(tool: StudioTool): string {
  return tool
}

export function useToolAdapter(toolRegistry: ToolRegistry) {
  const activeTool = toStudioTool(toolRegistry.activeToolId)

  return {
    activeTool,
    activateTool: (tool: StudioTool) => {
      toolRegistry.activate(toRegistryTool(tool))
    },
    isActive: (tool: StudioTool) => activeTool === tool,
  }
}
