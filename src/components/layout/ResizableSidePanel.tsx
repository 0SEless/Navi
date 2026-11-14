'use client'

import { useEffect, useId, useRef, useState, type ReactNode, type PointerEvent } from 'react'

export interface ResizableSidePanelProps {
  label: string
  side: 'left' | 'right'
  defaultWidth: number
  minWidth?: number
  maxWidth?: number
  maxWidthRatio?: number
  collapsed?: boolean
  collapsedWidth?: number
  onCollapsedChange?: (collapsed: boolean) => void
  showCollapseToggle?: boolean
  keepCollapsedContent?: boolean
  className?: string
  children: ReactNode
}

export function ResizableSidePanel({
  label, side, defaultWidth, minWidth = 160, maxWidth = 420, maxWidthRatio = 0.35,
  collapsed: controlledCollapsed, collapsedWidth = 28, onCollapsedChange,
  showCollapseToggle = false, keepCollapsedContent = false, className, children,
}: ResizableSidePanelProps) {
  const [requestedWidth, setRequestedWidth] = useState(defaultWidth)
  const [localCollapsed, setLocalCollapsed] = useState(false)
  const [availableWidth, setAvailableWidth] = useState<number | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const contentId = useId()
  const collapsed = controlledCollapsed ?? localCollapsed
  // Percentages are relative to this workspace, so adjacent navigation leaves room for the canvas.
  const upperBound = Math.max(minWidth, Math.min(maxWidth, availableWidth === null ? maxWidth : Math.floor(availableWidth * maxWidthRatio)))
  const width = Math.max(minWidth, Math.min(upperBound, requestedWidth))
  const direction = side === 'left' ? 1 : -1

  useEffect(() => {
    const parent = panelRef.current?.parentElement
    const measure = () => setAvailableWidth(parent?.clientWidth || window.innerWidth)
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (parent) observer?.observe(parent)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  useEffect(() => {
    // MapLibre tracks window resize; canvas viewports also observe their container.
    window.dispatchEvent(new Event('resize'))
  }, [width, collapsed])

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <aside ref={panelRef} aria-label={label} className={className}
      style={{ position: 'relative', width: collapsed ? collapsedWidth : width, minWidth: 0, minHeight: 0, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--navi-card)', [side === 'left' ? 'borderRight' : 'borderLeft']: '1px solid var(--navi-border)' }}
      onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
      {showCollapseToggle && (
        <button type="button" aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${label}`} aria-expanded={!collapsed} aria-controls={contentId}
          onClick={() => { setLocalCollapsed(!collapsed); onCollapsedChange?.(!collapsed) }}
          style={{ flexShrink: 0, alignSelf: collapsed ? 'center' : 'flex-end', border: 0, background: 'transparent', color: 'var(--navi-text-secondary)', cursor: 'pointer', padding: '6px', fontSize: 14 }}>
          {collapsed ? '›' : '‹'}
        </button>
      )}
      <div id={contentId} data-testid={`${label}-scroll`} hidden={collapsed && !keepCollapsedContent}
        style={{ flex: '1 1 0%', minHeight: 0, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain' }}>
        {children}
      </div>
      {!collapsed && <div role="separator" aria-label={`Resize ${label}`} aria-orientation="vertical" aria-controls={contentId}
        aria-valuemin={minWidth} aria-valuemax={upperBound} aria-valuenow={width} tabIndex={0}
        style={{ position: 'absolute', top: 0, bottom: 0, [side === 'left' ? 'right' : 'left']: 0, width: 6, cursor: 'col-resize', touchAction: 'none', userSelect: 'none', zIndex: 5 }}
        onPointerDown={event => {
          event.stopPropagation()
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.focus()
          drag.current = { pointerId: event.pointerId, x: event.clientX, width }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          event.stopPropagation()
          const current = drag.current
          if (!current || current.pointerId !== event.pointerId) return
          setRequestedWidth(Math.max(minWidth, Math.min(upperBound, current.width + (event.clientX - current.x) * direction)))
        }}
        onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={() => { drag.current = null }}
        onKeyDown={event => {
          event.stopPropagation()
          let next: number
          if (event.key === 'Home') next = minWidth
          else if (event.key === 'End') next = upperBound
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = width + (event.key === 'ArrowRight' ? 1 : -1) * direction * (event.shiftKey ? 50 : 10)
          else return
          event.preventDefault()
          setRequestedWidth(Math.max(minWidth, Math.min(upperBound, next)))
        }}
      />}
    </aside>
  )
}
