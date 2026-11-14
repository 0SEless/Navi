import { describe, it, expect, beforeEach } from 'vitest'
import { usePublicStore } from '../public-store'
import type { Building } from '@/types/nav-types'

// ── Test Helpers ──────────────────────────────────────────────

function makeBuilding(overrides: Partial<Building> = {}): Building {
  return {
    id: 'b1',
    name: 'Building 1',
    campusId: 'campus',
    floors: [0, 1, 2],
    footprint: [],
    baseElevation: 0,
    height: 9,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────

describe('W16C: IndoorContext', () => {
  beforeEach(() => {
    // Reset store to initial state
    usePublicStore.setState({
      selectedBuilding: null,
      activeFloor: 0,
      viewedFloorId: null,
      positionFloorId: null,
      positionFloorSource: 'unknown',
      positionBuildingId: null,
      indoorContext: { active: false },
    })
  })

  // ── T1: Initial State ──────────────────────────────────────

  describe('Initial State (Campus Mode)', () => {
    it('1. indoorContext.active is false on initial load', () => {
      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.active).toBe(false)
    })

    it('2. indoorContext.buildingId is undefined on initial load', () => {
      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.buildingId).toBeUndefined()
    })

    it('3. indoorContext.floorId is undefined on initial load', () => {
      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.floorId).toBeUndefined()
    })

    it('4. selectedBuilding is null on initial load', () => {
      const { selectedBuilding } = usePublicStore.getState()
      expect(selectedBuilding).toBeNull()
    })
  })

  // ── T2: Enter Building ─────────────────────────────────────

  describe('Enter Building', () => {
    it('5. selectBuilding activates indoor context', () => {
      const building = makeBuilding({ id: 'b1', floors: [0, 1, 2] })
      usePublicStore.getState().selectBuilding(building)

      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.active).toBe(true)
      expect(indoorContext.buildingId).toBe('b1')
    })

    it('6. selectBuilding sets only the viewed floor to the first floor', () => {
      const building = makeBuilding({ id: 'b1', floors: [0, 1, 2] })
      usePublicStore.getState().selectBuilding(building)

      const { indoorContext, activeFloor, viewedFloorId, positionFloorId, positionFloorSource } = usePublicStore.getState()
      expect(indoorContext.floorId).toBeUndefined()
      expect(activeFloor).toBe(0)
      expect(viewedFloorId).toBe(0)
      expect(positionFloorId).toBeNull()
      expect(positionFloorSource).toBe('unknown')
    })

    it('7. selectBuilding sets selectedBuilding', () => {
      const building = makeBuilding({ id: 'b1' })
      usePublicStore.getState().selectBuilding(building)

      const { selectedBuilding } = usePublicStore.getState()
      expect(selectedBuilding?.id).toBe('b1')
    })
  })

  // ── T3: Exit Building ──────────────────────────────────────

  describe('Exit Building', () => {
    it('8. selectBuilding(null) deactivates indoor context', () => {
      const building = makeBuilding({ id: 'b1' })
      usePublicStore.getState().selectBuilding(building)
      usePublicStore.getState().selectBuilding(null)

      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.active).toBe(false)
    })

    it('9. selectBuilding(null) clears buildingId', () => {
      const building = makeBuilding({ id: 'b1' })
      usePublicStore.getState().selectBuilding(building)
      usePublicStore.getState().selectBuilding(null)

      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.buildingId).toBeUndefined()
    })

    it('10. selectBuilding(null) clears selectedBuilding', () => {
      const building = makeBuilding({ id: 'b1' })
      usePublicStore.getState().selectBuilding(building)
      usePublicStore.getState().selectBuilding(null)

      const { selectedBuilding } = usePublicStore.getState()
      expect(selectedBuilding).toBeNull()
    })
  })

  // ── T4: Floor Selection ────────────────────────────────────

  describe('Floor Selection', () => {
    it('11. route-floor updates leave the separately reported position unchanged', () => {
      const building = makeBuilding({ id: 'b1', floors: [0, 1, 2] })
      usePublicStore.getState().selectBuilding(building)
      usePublicStore.getState().setPositionFloorManually(0, 'b1')
      usePublicStore.getState().setActiveFloor(1)

      const { indoorContext, activeFloor, positionFloorId, positionFloorSource } = usePublicStore.getState()
      expect(indoorContext.floorId).toBe(1)
      expect(activeFloor).toBe(1)
      expect(positionFloorId).toBe(0)
      expect(positionFloorSource).toBe('manual')
    })

    it('viewing another floor changes rendering selection without changing route or position floors', () => {
      usePublicStore.getState().enterIndoorContext('b1', 1)
      usePublicStore.getState().setPositionFloorManually(1, 'b1')

      usePublicStore.getState().setViewedFloor(2)

      const state = usePublicStore.getState()
      expect(state.viewedFloorId).toBe(2)
      expect(state.activeFloor).toBe(1)
      expect(state.indoorContext.floorId).toBe(1)
      expect(state.positionFloorId).toBe(1)
      expect(state.positionFloorSource).toBe('manual')
    })

    it('only a routable QR checkpoint updates the position floor as QR sourced', () => {
      usePublicStore.getState().setQrLocation({
        source: 'qr', campusId: 'campus', checkpointId: 'cp1', label: 'Stairs',
        buildingId: 'b1', floor: 1, nodeId: 'qr-node', anchor: 'graph-node',
      })

      expect(usePublicStore.getState()).toMatchObject({
        positionFloorId: 1, positionFloorSource: 'qr', positionBuildingId: 'b1',
      })

      usePublicStore.getState().setQrLocation({
        source: 'qr', campusId: 'campus', checkpointId: 'bad', label: 'Unresolved',
        buildingId: 'b1', floor: 2, nodeId: null, anchor: 'none',
      })

      expect(usePublicStore.getState()).toMatchObject({
        positionFloorId: 1, positionFloorSource: 'qr', positionBuildingId: 'b1',
      })
    })

    it('a manual floor report is marked manual and does not change the viewed floor', () => {
      usePublicStore.getState().setViewedFloor(2)

      usePublicStore.getState().setPositionFloorManually(1, 'b1')

      expect(usePublicStore.getState()).toMatchObject({
        viewedFloorId: 2, positionFloorId: 1, positionFloorSource: 'manual', positionBuildingId: 'b1',
      })
    })

    it('12. setActiveFloor does not affect indoorContext when inactive', () => {
      usePublicStore.getState().setActiveFloor(1)

      const { indoorContext, activeFloor } = usePublicStore.getState()
      expect(indoorContext.active).toBe(false)
      expect(indoorContext.floorId).toBeUndefined()
      expect(activeFloor).toBe(1)
    })
  })

  // ── T5: Programmatic API ───────────────────────────────────

  describe('Programmatic API', () => {
    it('13. enterIndoorContext activates with building and floor', () => {
      usePublicStore.getState().enterIndoorContext('b2', 2)

      const { indoorContext, activeFloor } = usePublicStore.getState()
      expect(indoorContext.active).toBe(true)
      expect(indoorContext.buildingId).toBe('b2')
      expect(indoorContext.floorId).toBe(2)
      expect(activeFloor).toBe(2)
    })

    it('14. exitIndoorContext deactivates indoor context', () => {
      usePublicStore.getState().enterIndoorContext('b1', 0)
      usePublicStore.getState().exitIndoorContext()

      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.active).toBe(false)
    })

    it('15. exitIndoorContext clears selectedBuilding', () => {
      const building = makeBuilding({ id: 'b1' })
      usePublicStore.getState().selectBuilding(building)
      usePublicStore.getState().exitIndoorContext()

      const { selectedBuilding } = usePublicStore.getState()
      expect(selectedBuilding).toBeNull()
    })
  })

  // ── T6: Building Isolation ─────────────────────────────────

  describe('Building Isolation', () => {
    it('16. indoorContext buildingId matches entered building', () => {
      usePublicStore.getState().enterIndoorContext('b1', 0)

      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.buildingId).toBe('b1')
    })

    it('17. switching buildings updates buildingId', () => {
      usePublicStore.getState().enterIndoorContext('b1', 0)
      usePublicStore.getState().enterIndoorContext('b2', 1)

      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.buildingId).toBe('b2')
      expect(indoorContext.floorId).toBe(1)
    })

    it('18. exitIndoorContext clears all context', () => {
      usePublicStore.getState().enterIndoorContext('b1', 2)
      usePublicStore.getState().exitIndoorContext()

      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.active).toBe(false)
      expect(indoorContext.buildingId).toBeUndefined()
      expect(indoorContext.floorId).toBeUndefined()
    })
  })

  // ── T7: Edge Cases ─────────────────────────────────────────

  describe('Edge Cases', () => {
    it('19. selectBuilding with empty floors defaults to floor 0', () => {
      const building = makeBuilding({ id: 'b1', floors: [] })
      usePublicStore.getState().selectBuilding(building)

      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.floorId).toBeUndefined()
      expect(usePublicStore.getState().viewedFloorId).toBe(0)
    })

    it('20. enterIndoorContext with floor 0 works', () => {
      usePublicStore.getState().enterIndoorContext('b1', 0)

      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.floorId).toBe(0)
    })

    it('21. multiple enterIndoorContext calls update state', () => {
      usePublicStore.getState().enterIndoorContext('b1', 0)
      usePublicStore.getState().enterIndoorContext('b1', 1)
      usePublicStore.getState().enterIndoorContext('b1', 2)

      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.floorId).toBe(2)
    })

    it('22. exitIndoorContext is idempotent', () => {
      usePublicStore.getState().exitIndoorContext()
      usePublicStore.getState().exitIndoorContext()

      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.active).toBe(false)
    })

    it('23. enterIndoorContext after exitIndoorContext works', () => {
      usePublicStore.getState().enterIndoorContext('b1', 0)
      usePublicStore.getState().exitIndoorContext()
      usePublicStore.getState().enterIndoorContext('b2', 1)

      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.active).toBe(true)
      expect(indoorContext.buildingId).toBe('b2')
      expect(indoorContext.floorId).toBe(1)
    })

    it('24. selectBuilding(null) after enterIndoorContext clears context', () => {
      usePublicStore.getState().enterIndoorContext('b1', 0)
      usePublicStore.getState().selectBuilding(null)

      const { indoorContext } = usePublicStore.getState()
      expect(indoorContext.active).toBe(false)
      expect(indoorContext.buildingId).toBeUndefined()
    })
  })
})
