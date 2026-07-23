'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'

export interface ToolDockItem {
  id: string
  label: string
  shortcut: string
  icon: React.ReactNode
}

export interface ToolGroup {
  id: string
  tools: ToolDockItem[]
}

export interface ToolDockProps {
  groups: ToolGroup[]
  activeTool: string
  onActivateTool: (toolId: string) => void
}

const DOCK_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  background: 'var(--navi-card)',
  border: '1px solid var(--navi-border)',
  borderRadius: 8,
  padding: '3px 6px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
}

const SEPARATOR_STYLE: React.CSSProperties = {
  width: 1,
  height: 24,
  background: 'var(--navi-border)',
  margin: '0 3px',
}

function ToolButton({ item, isActive, onActivate }: { item: ToolDockItem; isActive: boolean; onActivate: () => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onActivate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={hovered ? `${item.label} (${item.shortcut})` : item.label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        borderRadius: 6,
        border: isActive ? '1px solid var(--navi-primary)' : '1px solid transparent',
        background: isActive ? 'var(--navi-content)' : 'transparent',
        color: isActive ? 'var(--navi-primary)' : 'var(--navi-text-secondary)',
        cursor: 'pointer',
        fontSize: 15,
        lineHeight: 1,
        padding: 0,
        boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
      }}
    >
      {item.icon}
    </button>
  )
}

export function ToolDock({ groups, activeTool, onActivateTool }: ToolDockProps) {
  return (
    <div style={DOCK_STYLE}>
      {groups.map((group, gi) => (
        <React.Fragment key={group.id}>
          {gi > 0 && <div style={SEPARATOR_STYLE} />}
          {group.tools.map((item) => (
            <ToolButton
              key={item.id}
              item={item}
              isActive={activeTool === item.id}
              onActivate={() => onActivateTool(item.id)}
            />
          ))}
        </React.Fragment>
      ))}
    </div>
  )
}

const ICONS: Record<string, React.ReactNode> = {
  select: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>,
  pan: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>,
  space: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>,
  hallway: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="20" x2="20" y2="4"/><line x1="8" y1="22" x2="22" y2="8"/><line x1="2" y1="16" x2="16" y2="2"/></svg>,
  entrance: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>,
  stair: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4v-4h4v-4h4V8h4"/></svg>,
  elevator: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2" width="18" height="20" rx="2" ry="2"/><line x1="12" y1="14" x2="12" y2="22"/><path d="M10 10l2-2 2 2"/><path d="M10 18l2 2 2-2"/></svg>,
  building: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/></svg>,
  road: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="12" x2="2" y2="12"/><line x1="5" y1="3" x2="5" y2="21"/><line x1="19" y1="3" x2="19" y2="21"/></svg>,
  boundary: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/></svg>,
}

export const INTERIOR_TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'navigation',
    tools: [
      { id: 'select', label: 'Select', shortcut: 'V', icon: ICONS.select },
      { id: 'pan', label: 'Pan', shortcut: 'H', icon: ICONS.pan },
    ],
  },
  {
    id: 'geometry',
    tools: [
      { id: 'space', label: 'Space', shortcut: 'R', icon: ICONS.space },
      { id: 'hallway', label: 'Hallway', shortcut: 'T', icon: ICONS.hallway },
    ],
  },
  {
    id: 'connections',
    tools: [
      { id: 'entrance', label: 'Entrance', shortcut: 'E', icon: ICONS.entrance },
      { id: 'stair', label: 'Stair', shortcut: 'S', icon: ICONS.stair },
      { id: 'elevator', label: 'Elevator', shortcut: 'I', icon: ICONS.elevator },
    ],
  },
]

export const CAMPUS_TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'navigation',
    tools: [
      { id: 'select', label: 'Select', shortcut: 'V', icon: ICONS.select },
      { id: 'pan', label: 'Pan', shortcut: 'H', icon: ICONS.pan },
    ],
  },
  {
    id: 'geometry',
    tools: [
      { id: 'building', label: 'Building', shortcut: 'B', icon: ICONS.building },
      { id: 'route', label: 'Road', shortcut: 'O', icon: ICONS.road },
      { id: 'boundary', label: 'Boundary', shortcut: 'Y', icon: ICONS.boundary },
    ],
  },
]

export function useToolDockShortcuts(groups: ToolGroup[], activeTool: string, onActivateTool: (id: string) => void): void {
  const map = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    const m = new Map<string, string>()
    for (const group of groups) {
      for (const tool of group.tools) {
        m.set(tool.shortcut.toUpperCase(), tool.id)
      }
    }
    map.current = m
  }, [groups])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return
      if (e.key === 'Escape') return
      const shortcut = e.key.toUpperCase()
      const toolId = map.current.get(shortcut)
      if (toolId && toolId !== activeTool) {
        onActivateTool(toolId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTool, onActivateTool])
}
