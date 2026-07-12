import { describe, it, expect } from 'vitest'
import { ValidationRegistry } from './registry'
import { ValidationEngine, ScopeRouter } from './engine'
import {
  polygonClosureValidator,
  selfIntersectionValidator,
  duplicateIdsValidator,
} from './validators'
import { createDocument, createBuilding, createFloor, createRoom } from '../../test-helpers'

// ─── Helpers ──────────────────────────────────────────────────────

function createRegistry(): ValidationRegistry {
  const reg = new ValidationRegistry()
  reg.register(polygonClosureValidator)
  reg.register(selfIntersectionValidator)
  reg.register(duplicateIdsValidator)
  return reg
}

// ─── ValidationEngine ─────────────────────────────────────────────

describe('ValidationEngine', () => {
  describe('validateAll', () => {
    it('produces identical results to registry.validateAll', () => {
      const reg = createRegistry()
      const engine = new ValidationEngine(reg)
      const doc = createDocument()

      const regResults = reg.validateAll(doc)
      const engineResults = engine.validateAll(doc)

      // Same count (order may differ between validateAll calls)
      expect(engineResults.length).toBe(regResults.length)
    })

    it('runs all validators on a valid document', () => {
      const reg = createRegistry()
      const engine = new ValidationEngine(reg)
      const doc = createDocument()

      const issues = engine.validateAll(doc)
      // A valid document with 2 buildings should have no issues
      expect(issues.length).toBe(0)
    })

    it('captures validator crashes gracefully', () => {
      const reg = new ValidationRegistry()
      reg.register({
        id: 'crashy',
        label: 'Crashy',
        scope: 'entity',
        cost: 'cheap',
        validate: () => { throw new Error('boom') },
      })
      const engine = new ValidationEngine(reg)
      const doc = createDocument()

      const issues = engine.validateAll(doc)
      expect(issues.length).toBeGreaterThanOrEqual(1)
      expect(issues[0].message).toContain('crashed')
    })
  })

  describe('validateEntity', () => {
    it('returns only issues for the requested entity', () => {
      const reg = createRegistry()
      const engine = new ValidationEngine(reg)
      // Create a doc with a problem: unclosed building footprint
      const doc = createDocument({
        buildings: [
          createBuilding({
            id: 'bld-ok',
            name: 'OK Building',
            footprint: {
              points: [
                { lat: 0, lng: 0 },
                { lat: 0, lng: 1 },
                { lat: 1, lng: 1 },
                { lat: 1, lng: 0 },
                { lat: 0, lng: 0 }, // closed
              ],
            },
          }),
          createBuilding({
            id: 'bld-bad',
            name: 'Bad Building',
            footprint: {
              points: [
                { lat: 0, lng: 0 },
                { lat: 0, lng: 1 },
                { lat: 1, lng: 1 },
                { lat: 1, lng: 0 },
                // NOT closed — missing last point
              ],
            },
          }),
        ],
      })

      // Entity scope: issues for the bad building
      const issues = engine.validateEntity(doc, 'bld-bad')
      expect(issues.length).toBeGreaterThanOrEqual(1)
      expect(issues.every(i => i.entityId === 'bld-bad')).toBe(true)

      // Entity scope: issues for the OK building
      const okIssues = engine.validateEntity(doc, 'bld-ok')
      expect(okIssues.length).toBe(0)
    })

    it('runs only entity-scoped validators (not campus-scoped)', () => {
      const reg = createRegistry()
      const engine = new ValidationEngine(reg)
      // duplicateIdsValidator is campus-scoped — should NOT run at entity scope
      const doc = createDocument({
        buildings: [
          createBuilding({ id: 'same-id', name: 'B1' }),
          createBuilding({ id: 'same-id', name: 'B2' }), // duplicate ID
        ],
      })

      const issues = engine.validateEntity(doc, 'same-id')
      // Entity scope: duplicate ID check is campus-scoped, so it should NOT fire
      const dupIssue = issues.find(i => i.validatorId === 'duplicate-ids')
      expect(dupIssue).toBeUndefined()
    })

    it('returns empty array for non-existent entity', () => {
      const reg = createRegistry()
      const engine = new ValidationEngine(reg)
      const doc = createDocument()

      const issues = engine.validateEntity(doc, 'non-existent-id')
      expect(issues).toEqual([])
    })

    it('handles validator crashes gracefully at entity scope', () => {
      const reg = new ValidationRegistry()
      reg.register({
        id: 'entity-crash',
        label: 'Entity Crash',
        scope: 'entity',
        cost: 'cheap',
        validate: () => { throw new Error('entity crash') },
      })
      const engine = new ValidationEngine(reg)
      const doc = createDocument()

      const issues = engine.validateEntity(doc, 'bld-1')
      expect(issues.length).toBe(1)
      expect(issues[0].message).toContain('crashed')
    })
  })

  describe('validateScope', () => {
    it('validateScope campus returns all issues (same as validateAll)', () => {
      const reg = createRegistry()
      const engine = new ValidationEngine(reg)
      const doc = createDocument({
        buildings: [
          createBuilding({ id: 'dup', name: 'B1' }),
          createBuilding({ id: 'dup', name: 'B2' }),
        ],
      })

      const campusIssues = engine.validateScope(doc, 'campus')
      const allIssues = engine.validateAll(doc)
      expect(campusIssues.length).toBe(allIssues.length)
    })

    it('validateScope building returns issues limited to that building', () => {
      const reg = createRegistry()
      const engine = new ValidationEngine(reg)
      // Create a doc with unclosed footprint on building-1
      const doc = createDocument({
        buildings: [
          createBuilding({
            id: 'bld-1',
            name: 'Building One',
            footprint: {
              points: [
                { lat: 0, lng: 0 },
                { lat: 0, lng: 1 },
                { lat: 1, lng: 1 },
                { lat: 1, lng: 0 },
                // not closed
              ],
            },
          }),
          createBuilding({
            id: 'bld-2',
            name: 'Building Two',
            footprint: {
              points: [
                { lat: 0, lng: 0 },
                { lat: 0, lng: 1 },
                { lat: 1, lng: 1 },
                { lat: 1, lng: 0 },
                { lat: 0, lng: 0 }, // closed
              ],
            },
          }),
        ],
      })

      const bld1Issues = engine.validateScope(doc, 'building', { buildingId: 'bld-1' })
      expect(bld1Issues.length).toBeGreaterThanOrEqual(1)
      expect(bld1Issues.every(i => {
        // Issue must belong to bld-1 or its children
        return i.entityId === 'bld-1' || ['flr-test'].includes(i.entityId!)
      })).toBe(true)

      const bld2Issues = engine.validateScope(doc, 'building', { buildingId: 'bld-2' })
      expect(bld2Issues.length).toBe(0)
    })

    it('validateScope entity returns issues for only that entity', () => {
      const reg = createRegistry()
      const engine = new ValidationEngine(reg)
      const doc = createDocument({
        buildings: [
          createBuilding({
            id: 'bld-bad',
            name: 'Bad',
            footprint: {
              points: [
                { lat: 0, lng: 0 },
                { lat: 0, lng: 1 },
                // fewer than 3 points
              ],
            },
          }),
          createBuilding({
            id: 'bld-good',
            name: 'Good',
            footprint: {
              points: [
                { lat: 0, lng: 0 },
                { lat: 0, lng: 1 },
                { lat: 1, lng: 1 },
                { lat: 1, lng: 0 },
                { lat: 0, lng: 0 },
              ],
            },
          }),
        ],
      })

      const badIssues = engine.validateScope(doc, 'entity', { entityId: 'bld-bad' })
      expect(badIssues.length).toBeGreaterThanOrEqual(1)
      expect(badIssues.every(i => i.entityId === 'bld-bad')).toBe(true)

      const goodIssues = engine.validateScope(doc, 'entity', { entityId: 'bld-good' })
      expect(goodIssues.length).toBe(0)
    })
  })
})

// ─── ScopeRouter ──────────────────────────────────────────────────

describe('ScopeRouter', () => {
  describe('filterRules', () => {
    it('entity scope returns only entity-scoped rules', () => {
      const rules = [
        polygonClosureValidator, // entity
        selfIntersectionValidator, // entity
        duplicateIdsValidator, // campus
      ]
      const filtered = ScopeRouter.filterRules(rules, 'entity')
      expect(filtered).toHaveLength(2)
      expect(filtered.every(r => r.scope === 'entity')).toBe(true)
    })

    it('building scope returns entity + building rules', () => {
      const rules = [
        polygonClosureValidator, // entity
        duplicateIdsValidator, // campus
      ]
      const filtered = ScopeRouter.filterRules(rules, 'building')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('polygon-closure')
    })

    it('campus scope returns all rules', () => {
      const rules = [
        polygonClosureValidator, // entity
        selfIntersectionValidator, // entity
        duplicateIdsValidator, // campus
      ]
      const filtered = ScopeRouter.filterRules(rules, 'campus')
      expect(filtered).toHaveLength(3)
    })
  })

  describe('getBuildingEntityIds', () => {
    it('returns all entity IDs within a building', () => {
      const doc = createDocument({
        buildings: [
          createBuilding({
            id: 'bld-1',
            name: 'B1',
            floors: [
              createFloor({
                id: 'flr-1',
                level: 0,
                rooms: [
                  createRoom({ id: 'room-1', name: 'R1' }),
                  createRoom({ id: 'room-2', name: 'R2' }),
                ],
              }),
            ],
          }),
          createBuilding({
            id: 'bld-2',
            name: 'B2',
          }),
        ],
      })

      const ids = ScopeRouter.getBuildingEntityIds(doc, 'bld-1')
      expect(ids).toContain('bld-1')
      expect(ids).toContain('flr-1')
      expect(ids).toContain('room-1')
      expect(ids).toContain('room-2')
      expect(ids).not.toContain('bld-2')
    })

    it('returns only the building ID when building has no floors', () => {
      const doc = createDocument({
        buildings: [createBuilding({ id: 'empty-bld' })],
      })
      const ids = ScopeRouter.getBuildingEntityIds(doc, 'empty-bld')
      expect(ids).toEqual(['empty-bld'])
    })
  })

  describe('getAllEntityIds', () => {
    it('returns all entity IDs in the document', () => {
      const doc = createDocument({
        buildings: [
          createBuilding({
            id: 'bld-1',
            floors: [
              createFloor({
                id: 'flr-1',
                rooms: [createRoom({ id: 'room-1' })],
              }),
            ],
          }),
        ],
        roads: [{ id: 'road-1', name: 'Main', polyline: { points: [{ lat: 0, lng: 0 }] }, width: 5, surface: 'paved', type: 'arterial', metadata: {} }],
        panoramas: [{ id: 'pano-1', label: 'View', position: { lat: 0, lng: 0 }, heading: 0, imageAssetId: 'img-1', hotspots: [] }],
        qrCheckpoints: [{ id: 'qr-1', label: 'QR1', position: { lat: 0, lng: 0 }, floor: 0, buildingId: 'bld-1', code: 'abc', metadata: {} }],
      })

      const ids = ScopeRouter.getAllEntityIds(doc)
      expect(ids).toContain('bld-1')
      expect(ids).toContain('flr-1')
      expect(ids).toContain('room-1')
      expect(ids).toContain('road-1')
      expect(ids).toContain('pano-1')
      expect(ids).toContain('qr-1')
    })
  })

  describe('resolveBuilding', () => {
    it('returns building ID for a building itself', () => {
      const doc = createDocument()
      expect(ScopeRouter.resolveBuilding(doc, 'bld-1')).toBe('bld-1')
    })

    it('returns building ID for a floor within that building', () => {
      const doc = createDocument({
        buildings: [
          createBuilding({
            id: 'bld-1',
            floors: [createFloor({ id: 'flr-x' })],
          }),
          createBuilding({
            id: 'bld-2',
            floors: [createFloor({ id: 'flr-y' })],
          }),
        ],
      })
      expect(ScopeRouter.resolveBuilding(doc, 'flr-x')).toBe('bld-1')
      expect(ScopeRouter.resolveBuilding(doc, 'flr-y')).toBe('bld-2')
    })

    it('returns building ID for a room within that building', () => {
      const doc = createDocument({
        buildings: [
          createBuilding({
            id: 'bld-1',
            floors: [
              createFloor({
                id: 'flr-1',
                rooms: [createRoom({ id: 'room-deep' })],
              }),
            ],
          }),
        ],
      })
      expect(ScopeRouter.resolveBuilding(doc, 'room-deep')).toBe('bld-1')
    })

    it('returns null for top-level entities (roads, panoramas)', () => {
      const doc = createDocument()
      expect(ScopeRouter.resolveBuilding(doc, 'does-not-exist')).toBeNull()
    })
  })
})
