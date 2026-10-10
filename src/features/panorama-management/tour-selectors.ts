import type { Panorama } from '@navi/core'
import type { TourPanorama } from '@/components/tour/types'
import type { PanoramaView } from './selectors'

export interface TourSceneSection {
  id: string
  label: string | null
  scenes: PanoramaView[]
}
export interface TourSceneGroup {
  id: string
  label: string
  sections: TourSceneSection[]
}

/** Organization uses authored scope/floor context, independently of routing. */
export function groupTourScenes(scenes: PanoramaView[]): TourSceneGroup[] {
  const groups = new Map<string, { label: string; floors: Map<number | null, TourSceneSection> }>()
  const outdoor: PanoramaView[] = []
  for (const scene of scenes) {
    if (scene.scope === 'outdoor') { outdoor.push(scene); continue }
    const id = scene.buildingId ?? 'unknown-building'
    let group = groups.get(id)
    if (!group) {
      group = { label: scene.buildingName || 'Unknown building', floors: new Map() }
      groups.set(id, group)
    }
    let section = group.floors.get(scene.floor)
    if (!section) {
      section = { id: `${id}:floor:${scene.floor ?? 'unassigned'}`, label: scene.floorLabel || 'Unassigned floor', scenes: [] }
      group.floors.set(scene.floor, section)
    }
    section.scenes.push(scene)
  }
  const result: TourSceneGroup[] = [...groups.entries()]
    .sort((a, b) => a[1].label.localeCompare(b[1].label))
    .map(([id, group]) => ({ id, label: group.label, sections: [...group.floors.entries()].sort((a, b) => (a[0] ?? Infinity) - (b[0] ?? Infinity)).map(([, section]) => section) }))
  if (outdoor.length) result.push({ id: 'outdoor', label: 'Outdoor', sections: [{ id: 'outdoor-scenes', label: null, scenes: outdoor }] })
  return result
}

export function resolveTourSelection(scenes: Panorama[], requestedId: string | null) {
  if (requestedId === null) return { kind: 'none' as const }
  const index = scenes.findIndex(scene => scene.id === requestedId)
  if (index < 0) return { kind: 'not-found' as const, id: requestedId }
  return { kind: 'selected' as const, scene: scenes[index], index }
}

/** Only a render adapter: no image resolution, key parsing, or document mutation. */
export function toTourPanoramas(scenes: Panorama[]): TourPanorama[] {
  return scenes.map(scene => ({
    id: scene.id,
    label: scene.label || 'Untitled Panorama',
    imageUrl: scene.imageAssetId,
    heading: scene.heading,
    hotspots: (scene.hotspots ?? []).map((hotspot, index) => ({
      id: `${scene.id}:hotspot:${index}`,
      type: hotspot.hotspotType || 'navigation',
      yaw: hotspot.position.yaw,
      pitch: hotspot.position.pitch,
      label: hotspot.label || `Hotspot ${index + 1}`,
      targetPanoramaId: hotspot.target.type === 'panorama' ? hotspot.target.targetId : undefined,
      content: hotspot.content,
    })),
  }))
}

export function tourWorkspaceHref(campusId: string, sceneId?: string) {
  return `/panoramas?campus=${encodeURIComponent(campusId)}${sceneId === undefined ? '' : `&pano=${encodeURIComponent(sceneId)}`}`
}
