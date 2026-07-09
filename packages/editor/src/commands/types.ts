import type { CampusDocument } from '@navi/core'

export interface Command {
  id: string
  label: string
  payload: Record<string, unknown>
}

export interface CommandHandler {
  id: string
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult
  inverse?(payload: Record<string, unknown>, result: MutationResult): Command | null
}

export interface MutationResult {
  success: boolean
  entityId?: string
  data?: Record<string, unknown>
  error?: string
}

export interface PreHook {
  id: string
  before(command: Command, document: CampusDocument): void | Promise<void>
}

export interface PostHook {
  id: string
  after(command: Command, result: MutationResult, document: CampusDocument): void | Promise<void>
}
