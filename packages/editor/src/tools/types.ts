export interface ToolPointerEvent {
  x: number
  y: number
  lng: number
  lat: number
  button: number
  shiftKey: boolean
  ctrlKey: boolean
  altKey: boolean
}

export interface ToolContext {
  getService<T>(name: string): T | undefined
}

export interface Tool {
  id: string
  label: string
  cursor?: string

  onActivate?(ctx: ToolContext): void
  onDeactivate?(ctx: ToolContext): void
  onPointerDown?(event: ToolPointerEvent, ctx: ToolContext): void
  onPointerMove?(event: ToolPointerEvent, ctx: ToolContext): void
  onPointerUp?(event: ToolPointerEvent, ctx: ToolContext): void
  onKeyDown?(event: KeyboardEvent, ctx: ToolContext): void
}
