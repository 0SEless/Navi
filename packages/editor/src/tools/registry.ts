import type { Tool, ToolContext } from './types'

export class ToolRegistry {
  private tools = new Map<string, Tool>()
  private _activeId: string | null = null

  register(tool: Tool): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool already registered: ${tool.id}`)
    }
    this.tools.set(tool.id, tool)
  }

  activate(id: string, ctx?: ToolContext): void {
    if (!this.tools.has(id)) {
      throw new Error(`Unknown tool: ${id}`)
    }
    if (this._activeId) {
      this.tools.get(this._activeId)?.onDeactivate?.(ctx || emptyCtx)
    }
    this._activeId = id
    this.tools.get(id)?.onActivate?.(ctx || emptyCtx)
  }

  deactivate(ctx?: ToolContext): void {
    if (this._activeId) {
      this.tools.get(this._activeId)?.onDeactivate?.(ctx || emptyCtx)
      this._activeId = null
    }
  }

  get(id: string): Tool | undefined {
    return this.tools.get(id)
  }

  get activeTool(): Tool | null {
    return this._activeId ? this.tools.get(this._activeId) || null : null
  }

  get activeToolId(): string | null {
    return this._activeId
  }

  remove(id: string): void {
    if (this._activeId === id) {
      this.deactivate()
    }
    this.tools.delete(id)
  }

  get all(): Tool[] {
    return Array.from(this.tools.values())
  }
}

const emptyCtx: ToolContext = { getService: () => undefined }
