import { useSyncExternalStore } from 'react'
import { useEditor } from './editor-context'

const noopSubscribe = () => () => undefined
const zeroVersion = () => 0

export function useDocumentVersion(): number {
  const { services } = useEditor()
  const store = services.get('documentStore')
  return useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.getVersion ?? zeroVersion)
}
