import { BaseEditorService } from '../context/service-registry'

export class CurrentToolStore extends BaseEditorService {
  readonly id = 'toolRegistry'
  readonly dependencies: readonly string[] = []

  private _activeToolId: string | null = null

  get activeToolId(): string | null {
    return this._activeToolId
  }

  activate(id: string): void {
    this._activeToolId = id
  }

  deactivate(): void {
    this._activeToolId = null
  }
}
