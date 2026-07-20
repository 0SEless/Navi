'use client'

import type { CurrentToolStore } from '@navi/editor'
import type { StudioTool } from '@/types/studio-types'

const FLOOR_TOOL_IDS = new Set<string>(['select', 'room', 'entrance', 'stairs', 'elevator', 'hallway'])

function toStudioTool(id: string | null): StudioTool {
  if (id && FLOOR_TOOL_IDS.has(id)) return id as StudioTool
  return 'select'
}

export function useToolAdapter(toolStore: CurrentToolStore) {
  const activeTool = toStudioTool(toolStore.activeToolId)

  return {
    activeTool,
    activateTool: (tool: StudioTool) => {
      toolStore.activate(tool)
    },
    isActive: (tool: StudioTool) => activeTool === tool,
  }
}
