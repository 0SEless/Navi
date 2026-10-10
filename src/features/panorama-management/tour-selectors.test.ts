import { describe, expect, it } from 'vitest'
import type { Panorama } from '@navi/core'
import type { PanoramaView } from './selectors'
import { groupTourScenes, resolveTourSelection, toTourPanoramas, tourWorkspaceHref } from './tour-selectors'

const scene: Panorama = { id: 'lobby', label: 'Lobby', position: { x: 4, y: 6 }, buildingId: 'main', floor: 0, heading: 90, imageAssetId: 'panoramas/campus/lobby/opaque-asset.jpg', hotspots: [] }
function view(id: string, changes: Partial<PanoramaView> = {}): PanoramaView {
  return { id, label: id, scope: 'building', buildingId: 'main', buildingName: 'Main Building', floor: 0, floorLabel: 'Ground Floor', heading: 0, imageAssetId: '', hasImage: false, missingImage: true, hotspotCount: 0, health: 'missing-image', hasValidationError: false, issues: [], position: { kind: 'local', display: '4.0 m E, 6.0 m N' }, ...changes }
}

describe('dedicated tour adapters', () => {
  it('groups by canonical building and numeric floor, preserving ground floor zero', () => {
    const groups = groupTourScenes([view('upper', { floor: 2, floorLabel: 'Floor 2' }), view('lobby'), view('outside', { scope: 'outdoor', buildingId: undefined, buildingName: null, floor: null, floorLabel: null })])
    expect(groups.map(group => group.label)).toEqual(['Main Building', 'Outdoor'])
    expect(groups[0].sections.map(section => section.label)).toEqual(['Ground Floor', 'Floor 2'])
    expect(groups[0].sections[0].scenes[0].id).toBe('lobby')
    expect(groups[1].sections[0].label).toBeNull()
    expect(groups[1].sections[0].scenes[0].id).toBe('outside')
  })
  it('keeps different buildings with identical names separate and unknown floors truthful', () => {
    const groups = groupTourScenes([view('a'), view('b', { buildingId: 'other', floor: null, floorLabel: null })])
    expect(groups).toHaveLength(2)
    expect(groups[1].sections[0].label).toBe('Unassigned floor')
  })
  it('does not select an arbitrary scene when the URL is absent or unknown', () => {
    expect(resolveTourSelection([scene], null)).toEqual({ kind: 'none' })
    expect(resolveTourSelection([scene], 'missing')).toEqual({ kind: 'not-found', id: 'missing' })
    expect(resolveTourSelection([scene], scene.id)).toEqual({ kind: 'selected', scene, index: 0 })
  })
  it('keeps image references opaque and missing images empty without stock-photo substitution', () => {
    const adapted = toTourPanoramas([scene, { ...scene, id: 'empty', imageAssetId: '' }])
    expect(adapted[0].imageUrl).toBe(scene.imageAssetId)
    expect(adapted[1].imageUrl).toBe('')
    expect(scene.imageAssetId).toBe('panoramas/campus/lobby/opaque-asset.jpg')
  })
  it('maps only panorama transition targets and the actual supported information content', () => {
    const content = { title: 'Welcome', description: 'Campus information', linkUrl: 'https://example.org', linkLabel: 'Learn more' }
    const [adapted] = toTourPanoramas([{ ...scene, hotspots: [
      { label: 'To courtyard', target: { type: 'panorama', targetId: 'courtyard' }, position: { yaw: 120, pitch: -3 } },
      { hotspotType: 'information', label: 'Welcome', target: { type: 'url', targetId: '' }, position: { yaw: 30, pitch: 4 }, content },
      { label: 'Legacy unsupported target', target: { type: 'room', targetId: 'room-a' }, position: { yaw: 0, pitch: 0 } },
    ] }])
    expect(adapted.hotspots[0]).toMatchObject({ id: 'lobby:hotspot:0', type: 'navigation', targetPanoramaId: 'courtyard', yaw: 120, pitch: -3 })
    expect(adapted.hotspots[1]).toMatchObject({ type: 'information', content })
    expect(adapted.hotspots[2].targetPanoramaId).toBeUndefined()
  })
  it('uses stable hotspot identity independent of image changes', () => {
    const hotspot = { label: 'Info', target: { type: 'url' as const, targetId: '' }, position: { yaw: 0, pitch: 0 } }
    expect(toTourPanoramas([{ ...scene, hotspots: [hotspot] }])[0].hotspots[0].id).toBe(toTourPanoramas([{ ...scene, imageAssetId: 'changed', hotspots: [hotspot] }])[0].hotspots[0].id)
  })
  it('encodes shareable tour URLs without leaving /panoramas', () => {
    expect(tourWorkspaceHref('campus /?#', 'scene &/?#')).toBe('/panoramas?campus=campus%20%2F%3F%23&pano=scene%20%26%2F%3F%23')
    expect(tourWorkspaceHref('campus')).toBe('/panoramas?campus=campus')
  })
})
