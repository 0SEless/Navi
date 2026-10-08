import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import {
  CommandDispatcher,
  CommandRegistry,
  DocumentEventBus,
  DoorTool,
  SelectionManager,
  ServiceRegistry,
  Viewport,
} from '@navi/editor'
import { doorCreateHandler } from '@navi/editor/src/commands/feature-handlers'
import type { ToolPointerEvent } from '@navi/editor'
import { createFloorEditorToolContext } from '../floor-editor-tool-context'

function makeFloor(id: string, level: number) {
  return {
    id,
    level,
    label: id,
    elevation: level * 3,
    height: 3,
    rooms: [],
    hallways: [],
    staircases: [],
    elevators: [],
    entrances: [],
    connectorStops: [],
    parametricComponents: [],
    metadata: {},
  }
}

function makeDocument(): CampusDocument {
  return {
    schemaVersion: 1,
    version: 0,
    metadata: { campusId: 'campus-a', name: 'Campus A', description: '', lastModified: '', editorVersion: '1' },
    buildings: [{
      id: 'building-a', name: 'Building A', code: 'A', category: 'academic', description: '',
      footprint: { points: [] }, baseElevation: 0, height: 6, color: '#fff', aliases: [], metadata: {},
      verticalConnectors: [], floors: [makeFloor('floor-ground', 0), makeFloor('floor-upper', 1)],
    }],
    roads: [], panoramas: [], qrCheckpoints: [],
  }
}

function pointer(x: number, y: number): ToolPointerEvent {
  return { x, y, lng: x, lat: y, button: 0, shiftKey: false, ctrlKey: false, altKey: false }
}

function makeRegistry(document: CampusDocument): ServiceRegistry {
  const eventBus = new DocumentEventBus()
  const registry = new ServiceRegistry()
  const commands = new CommandRegistry()
  commands.register(doorCreateHandler)
  const dispatcher = new CommandDispatcher(commands, document, eventBus)
  const viewport = new Viewport(eventBus)
  viewport.setActiveBuilding('building-a')
  viewport.setActiveFloor('floor-upper')
  registry.register('eventBus', eventBus)
  registry.register('dispatcher', dispatcher)
  registry.register('viewport', viewport)
  registry.register('selection', new SelectionManager(document, eventBus))
  return registry
}

describe('Floor Editor tool service context', () => {
  it('creates a door on the active floor when given the registered tool services', () => {
    const document = makeDocument()
    const registry = makeRegistry(document)
    const tool = new DoorTool()
    const toolContext = createFloorEditorToolContext(registry, document)

    expect(toolContext.services).toBe(registry.typed)
    expect(toolContext.services.viewport).toBe(registry.get('viewport'))
    expect(toolContext.services.dispatcher).toBe(registry.get('dispatcher'))

    tool.onPointerDown(pointer(2, 3), toolContext)
    tool.onPointerUp(pointer(6, 5), toolContext)

    expect(document.buildings[0].floors[1].doors).toHaveLength(1)
    expect(document.buildings[0].floors[1].doors?.[0]).toMatchObject({
      position: { x: 4, y: 4 },
      width: 4,
      depth: 2,
      geometry: { type: 'rectangle', min: { x: 2, y: 3 }, max: { x: 6, y: 5 } },
    })
    expect(document.buildings[0].floors[0].doors).toBeUndefined()
  })

  it('fails visibly when required tool services are absent', () => {
    expect(() => createFloorEditorToolContext(new ServiceRegistry(), makeDocument())).toThrow(
      'Floor Editor tool context is missing required services: dispatcher, viewport, selection',
    )
  })
})
