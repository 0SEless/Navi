'use client'

import { useEffect, useRef } from 'react'
import { useSelection } from '@navi/editor'

const SRC_NODES = 's-nodes'
const SRC_NODES_CONNECTION = 's-nodes-connection'

interface SelectionOverlayProps {
  map: maplibregl.Map
}

export function SelectionOverlay({ map }: SelectionOverlayProps) {
  const { lastSelected } = useSelection()
  const lastHighlightedRef = useRef<string | null>(null)

  useEffect(() => {
    const prevId = lastHighlightedRef.current
    const currId = lastSelected?.id ?? null

    if (prevId && prevId !== currId) {
      try {
        map.setFeatureState({ source: SRC_NODES, id: prevId }, { selected: false })
        map.setFeatureState({ source: SRC_NODES_CONNECTION, id: prevId }, { selected: false })
      } catch { /* node may no longer exist */ }
    }

    if (currId) {
      try {
        map.setFeatureState({ source: SRC_NODES, id: currId }, { selected: true })
        map.setFeatureState({ source: SRC_NODES_CONNECTION, id: currId }, { selected: true })
      } catch { /* node may no longer exist */ }
    }

    lastHighlightedRef.current = currId
  }, [map, lastSelected])

  return null
}
