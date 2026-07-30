import type { ExpressionSpecification } from 'maplibre-gl'
import type { Road } from '../types/entities'
import { RoadStyle } from './road-style'

/**
 * Shared road layer paint definitions consumed by both
 * EntityRenderer (packages/editor) and MapRenderer (studio).
 *
 * Keeps the single source of truth for road visual appearance
 * in one place so style changes propagate to both renderers.
 */

export function roadWidthExpression(): ExpressionSpecification {
  return [
    'interpolate', ['linear'], ['zoom'],
    10, ['max', RoadStyle.minScreenWidthPx, ['*', ['get', 'width'], 0.15]],
    12, ['max', RoadStyle.minScreenWidthPx, ['*', ['get', 'width'], 0.60]],
    14, ['min', ['*', ['get', 'width'], 2.39], RoadStyle.maxScreenWidthPx],
    16, ['min', ['*', ['get', 'width'], 9.57], RoadStyle.maxScreenWidthPx],
    18, ['min', ['*', ['get', 'width'], 38.28], RoadStyle.maxScreenWidthPx],
    20, ['min', ['*', ['get', 'width'], 153.11], RoadStyle.maxScreenWidthPx],
  ] as ExpressionSpecification
}

/** Two-layer road rendering: black outline behind white fill (EntityRenderer) */
export function roadOutlinePaint(): Record<string, unknown> {
  return {
    'line-color': RoadStyle.outlineColor,
    'line-width': ['+', roadWidthExpression(), RoadStyle.outlineWidthPx],
    'line-opacity': 0.5,
  }
}

export function roadFillPaint(): Record<string, unknown> {
  return {
    'line-color': RoadStyle.fillColor,
    'line-width': roadWidthExpression(),
    'line-opacity': 0.8,
  }
}

/** Single-layer road rendering with dynamic color (MapRenderer traces) */
export function roadTracePaint(): Record<string, unknown> {
  return {
    'line-color': ['get', 'color'],
    'line-width': roadWidthExpression(),
    'line-opacity': 0.8,
  }
}

export function roadTraceInnerPaint(): Record<string, unknown> {
  return {
    'line-color': ['get', 'color'],
    'line-width': roadWidthExpression(),
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
