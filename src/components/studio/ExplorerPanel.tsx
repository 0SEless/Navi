'use client'

import { useMemo, useCallback } from 'react'
import {
  ExplorerAdapter,
  findNodeById,
  useSelection,
  useEditor,
  useDocumentVersion,
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
  const version = useDocumentVersion()

  const nodes = useMemo(() => ExplorerAdapter(document), [document, version])

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

  const handleDelete = useCallback(
    (id: EntityId) => {
      const dispatcher = services.get('dispatcher')
      const node = findNodeById(nodes, id)
      // No delete command exists for the campus root node.
      if (!node || node.type === 'campus') return
      // Each entity type has its own delete command with a type-specific
      // payload key (`<type>Id`), e.g. building.delete → { buildingId }.
      dispatcher?.execute({
        id: `${node.type}.delete`,
        label: 'Delete',
        payload: { [`${node.type}Id`]: id },
      })
    },
    [services, nodes],
  )

  return (
    <Explorer
      nodes={nodes}
      selectedId={selectedId}
      onSelect={selection.select}
      onRename={handleRename}
      onDelete={handleDelete}
    />
  )
}
