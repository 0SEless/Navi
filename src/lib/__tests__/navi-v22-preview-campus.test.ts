import { describe, expect, it } from 'vitest'
import { findNavRoute } from '@/lib/findRoute'
import { NAVI_V22_PREVIEW_CAMPUS_ID, naviV22PreviewCampus } from '@/lib/navi-v22-preview-campus'

describe('NAVI V2.2 local preview campus', () => {
  it('is clearly identified as synthetic demo data and contains a connected graph', () => {
    expect(NAVI_V22_PREVIEW_CAMPUS_ID).toBe('navi-v22-preview')
    expect(naviV22PreviewCampus.campusName).toContain('DEMO DATA')
    expect(naviV22PreviewCampus.nodes.length).toBeGreaterThan(10)
    expect(naviV22PreviewCampus.edges.every(edge =>
      naviV22PreviewCampus.nodes.some(node => node.id === edge.from)
      && naviV22PreviewCampus.nodes.some(node => node.id === edge.to),
    )).toBe(true)
  })

  it('routes from the Main Gate to Room 204 through the real stair transition', () => {
    const route = findNavRoute(naviV22PreviewCampus.nodes, naviV22PreviewCampus.edges, 'main-gate', 'room-204')

    expect(route).not.toBeNull()
    expect(route?.path).toContain('stairs-gf')
    expect(route?.path).toContain('stairs-1f')
    expect(route?.path).toContain('stairs-2f')
    expect(route?.path).toContain('room-204')
    expect(route?.nodeFloors).toEqual([2, 1, 0])
  })
})
