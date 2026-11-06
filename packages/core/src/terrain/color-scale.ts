/**
 * Height colours (editor only, off by default): one calm sand-to-brown scale, light sand at the
 * campus's lowest ground and deep earth brown at the highest. No green/yellow/red (owner 2026-11-06).
 */
export function heightsColorStops(minM: number, maxM: number): Array<[number, string]> {
  const top = maxM > minM ? maxM : minM + 1
  return [[minM, '#ece3cf'], [(minM + top) / 2, '#c9ab80'], [top, '#8a6a48']]
}

/**
 * Change colours (editor only): muted blue where lowered, muted clay where raised, deepest at ±5 m.
 * Changes within ±10 cm stay clear (MapLibre samples the colour scale coarsely, so a narrower clear
 * band tints untouched ground); from ±30 cm the tint is visible.
 */
export const CHANGES_COLOR_STOPS: Array<[number, string]> = [
  [-5, '#4a6f94'], [-0.3, '#a9bfd4'], [-0.1, 'rgba(0,0,0,0)'], [0.1, 'rgba(0,0,0,0)'], [0.3, '#e0b8a3'], [5, '#a8593d'],
]
