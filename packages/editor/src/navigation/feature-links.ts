// Indoor stairs and lifts connect floor to floor (2026-11-08). Each floor draws its own stair or lift; a stair keeps
// `links.below` / `links.above` — the stair it connects to on the floor directly below / above, in the same building.
// Links are always kept both ways, only between adjacent floors and only between the same kind.
import type { Building, Elevator, Staircase } from '@navi/core'

export type FeatureKind = 'staircase' | 'elevator'
type Feature = Staircase | Elevator
type Side = 'below' | 'above'

const list = (building: Building, kind: FeatureKind): Feature[] =>
  (kind === 'staircase' ? building.staircases : building.elevators) ?? []
const find = (building: Building, kind: FeatureKind, id: string) => list(building, kind).find((f) => f.id === id)
const other = (side: Side): Side => (side === 'below' ? 'above' : 'below')

/** The floor a stair or lift is on (its lowest floor with a shape; older multi-floor items: their lowest). */
export function featureFloor(feature: Feature): number {
  const levels = Object.keys(feature.levels ?? {}).map(Number).filter(Number.isFinite)
  return levels.length > 0 ? Math.min(...levels) : feature.fromLevel
}

/** The highest floor it is on (a new item: the same floor). */
function topFloor(feature: Feature): number {
  const levels = Object.keys(feature.levels ?? {}).map(Number).filter(Number.isFinite)
  return levels.length > 0 ? Math.max(...levels) : feature.toLevel
}

function setLink(feature: Feature, side: Side, id: string | undefined): void {
  const next = { ...(feature.links ?? {}) }
  if (id) next[side] = id
  else delete next[side]
  if (Object.keys(next).length > 0) feature.links = next
  else delete feature.links
}

/** Removes `id`'s link on one side, and its partner's matching link. */
export function unlinkFeature(building: Building, kind: FeatureKind, id: string, side: Side): void {
  const feature = find(building, kind, id)
  if (!feature) return
  const partnerId = feature.links?.[side]
  setLink(feature, side, undefined)
  const partner = partnerId ? find(building, kind, partnerId) : undefined
  if (partner && partner.links?.[other(side)] === id) setLink(partner, other(side), undefined)
}

/** Removes every link of `id`, on both sides and on its partners. */
export function clearFeatureLinks(building: Building, kind: FeatureKind, id: string): void {
  unlinkFeature(building, kind, id, 'below')
  unlinkFeature(building, kind, id, 'above')
}

/** Connects `lowerId` (floor N) to `upperId` (floor N+1); an existing partner on either affected side is let go. */
export function linkFeatures(building: Building, kind: FeatureKind, lowerId: string, upperId: string): { ok: true } | { ok: false; error: string } {
  const lower = find(building, kind, lowerId)
  const upper = find(building, kind, upperId)
  if (!lower || !upper) return { ok: false, error: `Both ${kind === 'staircase' ? 'stairs' : 'lifts'} must exist in this building.` }
  if (featureFloor(upper) !== topFloor(lower) + 1) return { ok: false, error: 'Stairs and lifts connect only to the floor directly above or below.' }
  unlinkFeature(building, kind, lowerId, 'above')
  unlinkFeature(building, kind, upperId, 'below')
  setLink(lower, 'above', upperId)
  setLink(upper, 'below', lowerId)
  return { ok: true }
}

/** Same-kind items on the floor directly below / above `id`. */
export function linkCandidates(building: Building, kind: FeatureKind, id: string, side: Side): Feature[] {
  const feature = find(building, kind, id)
  if (!feature) return []
  const target = side === 'below' ? featureFloor(feature) - 1 : topFloor(feature) + 1
  return list(building, kind).filter((f) => f.id !== id && (side === 'below' ? topFloor(f) : featureFloor(f)) === target)
}

const positionOn = (feature: Feature, level: number) => feature.levels?.[level]?.position ?? Object.values(feature.levels ?? {})[0]?.position

/** When placed: connect down to the nearest free item below, and up to the nearest free item above. */
export function autoLinkFeature(building: Building, kind: FeatureKind, id: string): void {
  const feature = find(building, kind, id)
  if (!feature) return
  const here = positionOn(feature, featureFloor(feature))
  const nearest = (candidates: Feature[], level: (f: Feature) => number) => {
    let best: { f: Feature; d: number } | null = null
    for (const f of candidates) {
      const p = positionOn(f, level(f))
      const d = here && p ? Math.hypot(here.x - p.x, here.y - p.y) : Number.POSITIVE_INFINITY
      if (!best || d < best.d) best = { f, d }
    }
    return best?.f
  }
  if (!feature.links?.below) {
    const below = nearest(linkCandidates(building, kind, id, 'below').filter((f) => !f.links?.above), topFloor)
    if (below) linkFeatures(building, kind, below.id, id)
  }
  if (!feature.links?.above) {
    const above = nearest(linkCandidates(building, kind, id, 'above').filter((f) => !f.links?.below), featureFloor)
    if (above) linkFeatures(building, kind, id, above.id)
  }
}
