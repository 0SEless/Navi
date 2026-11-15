/**
 * Where a route starts when the visitor has not set a starting point (owner 2026-11-14): the campus entrance
 * gate (a POI named "Entrance Gate" or "Main Gate"), at the outdoor route point nearest it. The visitor can
 * still pick another start or scan a QR checkpoint.
 */
type LatLng = { lat: number; lng: number }

export interface DefaultStart { nodeId: string; label: string }

const GATE_NAME = /\b(entrance|main)\s+gate\b/i
/** Published campus walkway nodes carry this building id; '' or absent also means outdoors. */
const OUTDOOR = '__outdoor__'

export function defaultStart(campus: {
  nodes: ReadonlyArray<{ id: string; position: LatLng; buildingId?: string | null; floor?: number | null }>
  poi: ReadonlyArray<unknown>
}): DefaultStart | null {
  const gate = campus.poi.find((p): p is { label: string; position: LatLng } => {
    const candidate = p as { label?: unknown; position?: unknown }
    return typeof candidate.label === 'string' && GATE_NAME.test(candidate.label) && typeof candidate.position === 'object' && candidate.position !== null
  })
  if (!gate) return null
  const k = Math.cos((gate.position.lat * Math.PI) / 180)
  let best: { id: string; d: number } | null = null
  for (const node of campus.nodes) {
    if (node.buildingId && node.buildingId !== OUTDOOR) continue
    const dx = (node.position.lng - gate.position.lng) * k
    const dy = node.position.lat - gate.position.lat
    const d = dx * dx + dy * dy
    if (!best || d < best.d) best = { id: node.id, d }
  }
  return best ? { nodeId: best.id, label: gate.label } : null
}
