import type { Tool, ToolPointerEvent, ToolContext } from './types'

export const panTool: Tool = {
  id: 'pan',
  label: 'Pan',
  cursor: 'grab',

  onPointerDown(_event: ToolPointerEvent, _ctx: ToolContext): void {
  },
}
