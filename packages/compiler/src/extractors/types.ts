import type { CampusDocument } from '@navi/core'
import type { NavigationSpace, TransitionPoint, WalkableCorridor } from '../types'

export interface ExtractionContext {
  campusId: string
  campusDocument: CampusDocument
  projectId: string
}

export interface CompileContext {
  campusId: string
  projectId: string
  options: import('../types').CompileOptions
}

export interface Extractor<TInput, TOutput> {
  extract(input: TInput, context: ExtractionContext): TOutput[]
}
