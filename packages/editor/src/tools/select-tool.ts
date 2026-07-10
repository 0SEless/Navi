import type { Tool, ToolPointerEvent, ToolContext } from './types'

export const selectTool: Tool = {
  id: 'select',
  label: 'Select',
  cursor: 'default',

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    const selection = ctx.services.selection

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
      ctx.services.selection.clear()
    }
  },
}

function entityAtEvent(event: ToolPointerEvent): string | null {
  return null
}
