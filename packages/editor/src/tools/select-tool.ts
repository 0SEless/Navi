import type { Tool, ToolPointerEvent, ToolContext } from './types'
import type { SelectionManager } from '../selection'

export const selectTool: Tool = {
  id: 'select',
  label: 'Select',
  cursor: 'default',

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    const selection = ctx.getService<SelectionManager>('selection')
    if (!selection) return

    if (event.shiftKey) {
      const id = entityAtEvent(event)
      if (id) {
        selection.toggle(id)
      }
    } else {
      const id = entityAtEvent(event)
      if (id) {
        selection.select(id)
      } else {
        selection.clear()
      }
    }
  },

  onKeyDown(event: KeyboardEvent, ctx: ToolContext): void {
    if (event.key === 'Escape') {
      const selection = ctx.getService<SelectionManager>('selection')
      selection?.clear()
    }
  },
}

function entityAtEvent(event: ToolPointerEvent): string | null {
  return null
}
