import type { SiteArtifact } from '@navi/core'

/**
 * NAVI Web on flat ground (owner 2026-11-16: "for Thursday we don't need the full terrain … the terrain will be
 * flat 2D"; a terrain option comes later). The published campus without its terrain: no ground heights, every
 * building standing on the ground (base 0), and no hillside stairs/ramps (they only make sense on the slope).
 * Boundary, roads and look are kept. The published site itself is not changed.
 */
export function flatSite(site: SiteArtifact | undefined | null): SiteArtifact | undefined {
  if (!site) return undefined
  const { terrain: _terrain, ...rest } = site
  return { ...rest, buildings: site.buildings.map((b) => ({ ...b, baseM: 0 })), structures: [] } as SiteArtifact
}
