'use client'

import { useMemo, useCallback } from 'react'
import {
  ExplorerAdapter,
  useSelection,
  useEditor,
} from '@navi/editor'
import type { EntityId, EntitySelector } from '@navi/editor'
import { Explorer } from './Explorer'

/**
 * Thin container.
 *
 * Responsibilities:
 * - Read state from EditorContext
 * - Project CampusDocument → ExplorerNode[] via ExplorerAdapter
 * - Bridge UI intents to editor services
 * - Pass props into the render-only Explorer
 *
 * It never owns business logic.
 */
export function ExplorerPanel() {
  const { document, services } = useEditor()
  const selection = useSelection()

  const nodes = useMemo(() => ExplorerAdapter(document), [document])

  const selectedId: EntityId | null = selection.lastSelected?.id ?? null

  const handleRename = useCallback(
    (id: EntityId, newName: string) => {
      const dispatcher = services.get('dispatcher')
      // Dispatch as a typed Command object — not a magic string.
      // The codebase's dispatcher.execute takes a structured Command;
      // `entity.update` renames via the `changes.name` payload.
      dispatcher?.execute({
        id: 'entity.update',
        label: 'Rename',
        payload: { entityId: id, changes: { name: newName } },
      })
    },
    [services],
  )

  return (
    <Explorer
      nodes={nodes}
      selectedId={selectedId}
      onSelect={selection.select}
      onRename={handleRename}
    />
  )
}
