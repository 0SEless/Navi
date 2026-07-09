import { createContext, useContext } from 'react'
import type { CampusDocument } from '@navi/core'
import { ServiceRegistry } from './service-registry'

export interface EditorContext {
  document: CampusDocument
  services: ServiceRegistry
}

export const serviceNames = {
  dispatcher: 'dispatcher',
  history: 'history',
  selection: 'selection',
  toolRegistry: 'toolRegistry',
  validation: 'validation',
  eventBus: 'eventBus',
  viewport: 'viewport',
} as const

const EditorReactContext = createContext<EditorContext | null>(null)

export function EditorProvider({ children, context }: { children: React.ReactNode; context: EditorContext }) {
  return (
    <EditorReactContext.Provider value={context}>
      {children}
    </EditorReactContext.Provider>
  )
}

export function useEditor(): EditorContext {
  const ctx = useContext(EditorReactContext)
  if (!ctx) {
    throw new Error('useEditor must be used within an EditorProvider')
  }
  return ctx
}
