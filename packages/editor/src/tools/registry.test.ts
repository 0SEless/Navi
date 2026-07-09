import { describe, it, expect, beforeEach } from 'vitest'
import { ToolRegistry } from './registry'
import { selectTool } from './select-tool'
import { panTool } from './pan-tool'

describe('ToolRegistry', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry()
    registry.register(selectTool)
    registry.register(panTool)
  })

  it('registers and retrieves tools', () => {
    expect(registry.get('select')).toBe(selectTool)
    expect(registry.get('pan')).toBe(panTool)
  })

  it('activates a tool', () => {
    registry.activate('select')
    expect(registry.activeToolId).toBe('select')
    expect(registry.activeTool).toBe(selectTool)
  })

  it('throws for unknown tool', () => {
    expect(() => registry.activate('nope')).toThrow('Unknown tool')
  })

  it('deactivates current tool', () => {
    registry.activate('select')
    registry.deactivate()
    expect(registry.activeTool).toBeNull()
  })

  it('switching tools deactivates previous', () => {
    registry.activate('select')
    registry.activate('pan')
    expect(registry.activeToolId).toBe('pan')
  })

  it('all returns all tools', () => {
    expect(registry.all).toHaveLength(2)
  })
})
