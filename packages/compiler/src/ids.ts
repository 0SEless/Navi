// One id counter per compile (2026-11-08). Every generator numbers its ids through this module, and compileV2 resets
// it first: ids are unique within a compile (rooms and QR anchors no longer share 'POI-1') and the same campus always
// compiles to the same ids, whatever ran before in the same server process.
let counters = new Map<string, number>()

export function resetCompilerIds(): void {
  counters = new Map()
}

export function nextCompilerId(prefix: string): string {
  const next = (counters.get(prefix) ?? 0) + 1
  counters.set(prefix, next)
  return `${prefix}-${next}`
}
