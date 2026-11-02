/** Heights view (editor only): green at the campus's lowest ground → yellow → red at the highest. */
export function heightsColorStops(minM: number, maxM: number): Array<[number, string]> {
  const top = maxM > minM ? maxM : minM + 1
  return [[minM, '#22c55e'], [(minM + top) / 2, '#eab308'], [top, '#ef4444']]
}

/**
 * Changes view (editor only): lowered blue, raised red, deepest at ±5 m. Changes within ±10 cm stay
 * clear (MapLibre samples the colour scale coarsely, so a narrower clear band tints untouched ground);
 * from ±30 cm the tint is clearly visible.
 */
export const CHANGES_COLOR_STOPS: Array<[number, string]> = [
  [-5, '#1d4ed8'], [-0.3, '#93c5fd'], [-0.1, 'rgba(0,0,0,0)'], [0.1, 'rgba(0,0,0,0)'], [0.3, '#fca5a5'], [5, '#dc2626'],
]
