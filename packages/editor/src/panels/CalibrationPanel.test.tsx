import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { EditorProvider } from '../context'
import type { EditorContext } from '../context'
import type { CampusDocument } from '@navi/core'
import { DocumentEventBus } from '../eventbus'
import { CommandRegistry, CommandDispatcher } from '../commands'
import { Viewport } from '../viewport'
import { CurrentToolStore } from '../tools'
import { CalibrationPanel } from './CalibrationPanel'

afterEach(cleanup)

function createMockContext(buildingId?: string, floorId?: string): EditorContext {
  const eventBus = new DocumentEventBus()
  const registry = new CommandRegistry()
  const toolRegistry = new CurrentToolStore()
  const document: CampusDocument = {
    schemaVersion: 1,
    metadata: { name: 'test', description: '', lastModified: '', editorVersion: '0.1.0' },
    buildings: [{
      id: 'bld-1', name: 'Main', code: 'M', category: 'academic', description: '',
      footprint: { points: [{ lat: 10, lng: 20 }, { lat: 10, lng: 20.001 }, { lat: 10.001, lng: 20.001 }, { lat: 10.001, lng: 20 }, { lat: 10, lng: 20 }] },
      baseElevation: 0, height: 20, color: '#4A90D9', aliases: [], metadata: {},
      floors: [
        { id: 'flr-1', level: 0, label: 'Ground', elevation: 0, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], metadata: {} },
      ],
    }],
    roads: [], panoramas: [], qrCheckpoints: [],
  }
  const viewport = new Viewport(eventBus)
  if (buildingId) viewport.setActiveBuilding(buildingId)
  if (floorId) viewport.setActiveFloor(floorId)
  const dispatcher = new CommandDispatcher(registry, document, eventBus)
  const services = {
    get(name: string) {
      if (name === 'dispatcher') return dispatcher
      if (name === 'viewport') return viewport
      if (name === 'eventBus') return eventBus
      if (name === 'toolRegistry') return toolRegistry
    },
  }
  return { document, services }
}

describe('CalibrationPanel', () => {
  it('renders start button when no building selected', () => {
    const ctx = createMockContext()
    const { container } = render(
      <EditorProvider context={ctx}>
        <CalibrationPanel />
      </EditorProvider>,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders start button when floor selected', () => {
    const ctx = createMockContext('bld-1', 'flr-1')
    render(
      <EditorProvider context={ctx}>
        <CalibrationPanel />
      </EditorProvider>,
    )
    expect(screen.getByText('Start Calibration')).toBeDefined()
  })

  it('shows saved calibration when present', () => {
    const ctx = createMockContext('bld-1', 'flr-1')
    ctx.document.buildings[0].floors[0].metadata._calibration = {
      scale: 0.05,
      rotation: 0,
      confidence: 0.95,
    }
    render(
      <EditorProvider context={ctx}>
        <CalibrationPanel />
      </EditorProvider>,
    )
    expect(screen.getByText(/Calibrated/)).toBeDefined()
    expect(screen.getByText(/Recalibrate/)).toBeDefined()
    expect(screen.getByText(/Clear/)).toBeDefined()
  })
})
