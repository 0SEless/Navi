import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import type { ValidationIssue } from './snapshot'
import { describeIssueContext, presentValidationIssue } from './presentation'

function issue(overrides: Partial<ValidationIssue> = {}): ValidationIssue {
  return {
    issueId: 'issue-1',
    ruleId: 'unknown-rule',
    severity: 'error',
    message: 'The validation rule failed.',
    targets: [],
    ...overrides,
  }
}

// Every rule the Studio Validate button runs (create-editor-context), so none falls back to vague words.
const STUDIO_RULES = [
  'disconnected-graph', 'missing-footprint', 'orphan-reference', 'missing-name', 'zero-area-polygon', 'polygon-closure',
  'self-intersection', 'duplicate-ids', 'entrance-connectivity', 'floor-metadata', 'road-connectivity', 'reference',
  'connector-connectivity', 'room-door-connectivity', 'room-door-geometry', 'feature-extent', 'stair-top-reach',
  'feature-unconnected', 'feature-overlap', 'feature-connectivity', 'route-network-structure', 'route-network-disconnected',
  'route-room-access', 'route-entrance-access', 'route-floor-consistency', 'route-stair', 'route-room-unreachable',
  'route-floor-unreachable', 'route-stair-link', 'route-entrance-off-road', 'route-through-wall',
]

describe('presentValidationIssue (owner 2026-11-19: "the problem panel text is really vague")', () => {
  it('every Studio rule has its own title, group and how-to-fix line', () => {
    for (const ruleId of STUDIO_RULES) {
      const result = presentValidationIssue(issue({ ruleId }))
      expect(result.ruleLabel, ruleId).not.toBe('Other')
      expect(result.guidance, ruleId).not.toMatch(/inspect the affected/i)
      expect(result.guidance.length, ruleId).toBeGreaterThan(10)
    }
  })

  it('a stair not joined says to press Auto-connect', () => {
    const result = presentValidationIssue(issue({ ruleId: 'route-stair-link' }))
    expect(result.title).toBe('Stair not joined to the route')
    expect(result.guidance).toMatch(/Auto-connect/)
  })

  it('an unknown rule gets a readable title and no made-up guidance', () => {
    const result = presentValidationIssue(issue({ ruleId: 'campus-custom-rule' }))
    expect(result.ruleLabel).toBe('Other')
    expect(result.title).toBe('Campus custom rule')
    expect(result.guidance).toBe('')
  })

  it('does not change the issue', () => {
    const source = issue({ ruleId: 'route-entrance-access', targets: [{ entityId: 'entrance-1', entityType: 'entrance' }] })
    const copy = structuredClone(source)
    presentValidationIssue(source)
    expect(source).toEqual(copy)
  })
})

describe('describeIssueContext: names, not ids', () => {
  const document = {
    roads: [{ id: 'T-3', name: 'Untitled' }],
    buildings: [{
      id: 'osm-bldg-1', name: 'COMDEV BUILDING',
      floors: [{ id: 'flr-8', level: 1, label: 'Floor 2', rooms: [{ id: 'room-13', name: 'CD205' }], entrances: [], walls: [] }],
      staircases: [{ id: 'stair-4', name: 'Staircase', fromLevel: 1, toLevel: 1, levels: { 1: {} } }], elevators: [],
    }],
  } as unknown as CampusDocument

  it('says the building and floor by name, and what it points at', () => {
    const context = describeIssueContext(document, issue({ buildingId: 'osm-bldg-1', floorId: 'flr-8',
      targets: [{ entityId: 'route-edge-28', entityType: 'route-edge' }, { entityId: 'wall-10', entityType: 'wall' }] }))
    expect(context.place).toBe('COMDEV BUILDING · Floor 2')
    expect(context.things).toBe('Route line, Wall')
    expect(JSON.stringify(context)).not.toMatch(/osm-bldg|flr-8|route-edge-28|wall-10/)
  })

  it('names a room and a stair, and finds the building from the stair', () => {
    expect(describeIssueContext(document, issue({ targets: [{ entityId: 'stair-4', entityType: 'staircase' }] }))).toEqual({ place: 'COMDEV BUILDING · Floor 2', things: 'Stair "Staircase"' })
    expect(describeIssueContext(document, issue({ buildingId: 'osm-bldg-1', floorId: 'flr-8', targets: [{ entityId: 'room-13', entityType: 'room' }, { entityId: 'door-8', entityType: 'door' }] })).things).toBe('Room "CD205", Door')
  })

  it('an untitled road is just "Road"', () => {
    expect(describeIssueContext(document, issue({ targets: [{ entityId: 'T-3', entityType: 'road' }] })).things).toBe('Road')
  })
})

describe('which building and floor (owner 2026-11-19)', () => {
  const document = {
    roads: [],
    buildings: [{
      id: 'b1', name: 'TOURISM BUILDING',
      floors: [
        { id: 'f0', level: 0, label: 'Ground Floor', rooms: [], entrances: [], walls: [{ id: 'w1' }], roomDoors: [] },
        { id: 'f1', level: 1, label: 'Floor 2', rooms: [], entrances: [], walls: [], roomDoors: [] },
      ],
      staircases: [{ id: 's1', name: 'Staircase', fromLevel: 0, toLevel: 1, levels: { 0: {}, 1: { role: 'top' } } }], elevators: [],
    }],
  } as unknown as CampusDocument

  it('a stair problem with no floor given is on the stair\'s flight floor', () => {
    expect(describeIssueContext(document, issue({ targets: [{ entityId: 's1', entityType: 'staircase' }] })).place).toBe('TOURISM BUILDING · Ground Floor')
  })

  it('a wall problem finds its building and floor from the wall', () => {
    expect(describeIssueContext(document, issue({ targets: [{ entityId: 'w1', entityType: 'wall' }] })).place).toBe('TOURISM BUILDING · Ground Floor')
  })

  it('a campus-wide problem says so', () => {
    expect(describeIssueContext(document, issue({ targets: [] })).place).toBe('Whole campus')
  })
})
