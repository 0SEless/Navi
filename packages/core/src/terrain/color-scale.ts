/** Heights view (editor only): green at the campus's lowest ground → yellow → red at the highest. */
export function heightsColorStops(minM: number, maxM: number): Array<[number, string]> {
  const top = maxM > minM ? maxM : minM + 1
  return [[minM, '#22c55e'], [(minM + top) / 2, '#eab308'], [top, '#ef4444']]
}

/** Changes view (editor only): lowered blue, unchanged clear, raised red, ±5 m. */
export const CHANGES_COLOR_STOPS: Array<[number, string]> = [[-5, '#3b82f6'], [0, 'rgba(0,0,0,0)'], [5, '#ef4444']]
