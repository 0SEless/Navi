import type { Road } from '../types/entities'
import { RoadStyle } from './road-style'

/**
 * Shared road layer paint definitions consumed by both
 * EntityRenderer (packages/editor) and MapRenderer (studio).
 *
 * Keeps the single source of truth for road visual appearance
 * in one place so style changes propagate to both renderers.
 */

/** Two-layer road rendering: black outline behind white fill (EntityRenderer) */
export function roadOutlinePaint(): Record<string, unknown> {
  return {
    'line-color': RoadStyle.outlineColor,
    'line-width': ['+', ['get', 'width'], RoadStyle.outlineWidthPx],
    'line-opacity': 0.5,
  }
}

export function roadFillPaint(): Record<string, unknown> {
  return {
    'line-color': RoadStyle.fillColor,
    'line-width': ['get', 'width'],
    'line-opacity': 0.8,
  }
}

/** Single-layer road rendering with dynamic color (MapRenderer traces) */
export function roadTracePaint(): Record<string, unknown> {
  return {
    'line-color': ['get', 'color'],
    'line-width': ['get', 'width'],
    'line-opacity': 0.8,
  }
}

export function roadTraceInnerPaint(): Record<string, unknown> {
  return {
    'line-color': ['get', 'color'],
    'line-width': ['get', 'width'],
    'line-opacity': 0.5,
  }
}

/** Map a Road entity's type to a default color */
export function roadTypeColor(type: Road['type']): string {
  switch (type) {
    case 'arterial': return '#1C6BEB'
    case 'connector': return '#94A3B8'
    case 'service': return '#64748B'
    default: return RoadStyle.fillColor
  }
}
