'use client'

import { ToolRegistry } from '@navi/editor'

const FLOOR_TOOLS = ['select', 'room', 'entrance', 'stairs', 'elevator', 'hallway']

export function configureFloorEditorTools(toolRegistry: ToolRegistry): void {
  for (const id of FLOOR_TOOLS) {
    if (!toolRegistry.get(id)) {
      toolRegistry.register({ id, onActivate() {}, onDeactivate() {} })
    }
  }
}
