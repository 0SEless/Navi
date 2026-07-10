'use client'

import React from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { ExplorerNode, EntityId, EntitySelector, SelectionOrigin } from '@navi/editor'

interface ExplorerItemProps {
  node: ExplorerNode
  depth: number
  expanded: boolean
  selected: boolean
  searchQuery: string
  onToggle: (id: EntityId) => void
  onSelect: (selector: EntitySelector, origin: SelectionOrigin) => void
}

const typeLabels: Record<string, string> = {
  campus: '📋',
  building: '🏛',
  floor: '📄',
  room: '▢',
  hallway: '⇔',
  staircase: '↑↓',
  elevator: '⊞',
  entrance: '→',
  road: '↔',
  panorama: '◉',
  qr: '◆',
}

function ExplorerItemImpl({
  node,
  depth,
  expanded,
  selected,
  searchQuery,
  onToggle,
  onSelect,
}: ExplorerItemProps) {
  const hasChildren = node.children && node.children.length > 0

  const renderLabel = () => {
    if (!searchQuery) return node.label
    const idx = node.label.toLowerCase().indexOf(searchQuery.toLowerCase())
    if (idx === -1) return node.label
    return (
      <>
        {node.label.slice(0, idx)}
        <mark style={{ background: '#fef08a', borderRadius: 2, padding: '0 1px' }}>
          {node.label.slice(idx, idx + searchQuery.length)}
        </mark>
        {node.label.slice(idx + searchQuery.length)}
      </>
    )
  }

  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={hasChildren ? expanded : undefined}
      data-selected={selected ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'center',
        paddingLeft: depth * 16 + 4,
        paddingRight: 4,
        height: 28,
        cursor: 'pointer',
        background: selected ? '#e0f2fe' : 'transparent',
        fontSize: 13,
        userSelect: 'none',
        borderBottom: '1px solid #f3f4f6',
      }}
      onClick={() => onSelect(node.entitySelector, 'explorer' as SelectionOrigin)}
    >
      {hasChildren ? (
        <span
          onClick={(e) => { e.stopPropagation(); onToggle(node.id) }}
          style={{ display: 'inline-flex', width: 16, height: 16, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          aria-label={expanded ? `Collapse ${node.label}` : `Expand ${node.label}`}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      ) : (
        <span style={{ display: 'inline-flex', width: 16, flexShrink: 0 }} />
      )}
      <span style={{ marginRight: 4, fontSize: 12, flexShrink: 0 }}>
        {typeLabels[node.type] ?? '•'}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {renderLabel()}
      </span>
    </div>
  )
}

export const ExplorerItem = React.memo(ExplorerItemImpl)
