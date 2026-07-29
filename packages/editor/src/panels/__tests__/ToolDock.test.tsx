import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)
import { ToolDock, INTERIOR_TOOL_GROUPS, CAMPUS_TOOL_GROUPS, useToolDockShortcuts } from '../ToolDock'
import type { ToolGroup } from '../ToolDock'

const EMPTY_GROUPS: ToolGroup[] = []

function renderDock(props?: { activeTool?: string; onActivate?: () => void }) {
  const onActivate = props?.onActivate ?? vi.fn()
  return {
    onActivate,
    ...render(
      <ToolDock
        groups={INTERIOR_TOOL_GROUPS}
        activeTool={props?.activeTool ?? 'select'}
        onActivateTool={onActivate}
      />,
    ),
  }
}

describe('ToolDock', () => {
  it('renders all interior tool groups', () => {
    renderDock()
    expect(screen.getByTitle(/Navigate/)).toBeDefined()
    expect(screen.getByTitle(/Space/)).toBeDefined()
    expect(screen.getByTitle(/Hallway/)).toBeDefined()
    expect(screen.getByTitle(/Entrance/)).toBeDefined()
    expect(screen.getByTitle(/Stair/)).toBeDefined()
    expect(screen.getByTitle(/Elevator/)).toBeDefined()
  })

  it('renders campus tool groups', () => {
    render(
      <ToolDock groups={CAMPUS_TOOL_GROUPS} activeTool="select" onActivateTool={vi.fn()} />,
    )
    expect(screen.getByTitle(/Navigate/)).toBeDefined()
    expect(screen.getByTitle(/Building/)).toBeDefined()
    expect(screen.getByTitle(/Road/)).toBeDefined()
    expect(screen.getByTitle(/Boundary/)).toBeDefined()
  })

  it('shows keyboard shortcut on hover', () => {
    renderDock()
    const spaceBtn = screen.getByTitle(/Space/)
    fireEvent.mouseEnter(spaceBtn)
    expect(spaceBtn.getAttribute('title')).toContain('(R)')
  })

  it('renders nothing for empty groups', () => {
    const { container } = render(
      <ToolDock groups={EMPTY_GROUPS} activeTool="select" onActivateTool={vi.fn()} />,
    )
    const dock = container.querySelector('div')
    expect(dock?.children.length ?? 0).toBe(0)
  })

  it('calls onActivateTool when button clicked', () => {
    const { onActivate } = renderDock()
    const spaceBtn = screen.getByTitle(/Space/)
    fireEvent.click(spaceBtn)
    expect(onActivate).toHaveBeenCalledWith('space')
  })

  it('highlights active tool', () => {
    const { container } = renderDock({ activeTool: 'hallway' })
    const buttons = container.querySelectorAll('button')
    const activeBtn = Array.from(buttons).find((b) =>
      b.style.border.includes('var(--navi-primary)'),
    )
    expect(activeBtn).toBeDefined()
  })
})

describe('INTERIOR_TOOL_GROUPS', () => {
  it('has geometry, connections, and calibration groups', () => {
    const ids = INTERIOR_TOOL_GROUPS.map((g) => g.id)
    expect(ids).toContain('geometry')
    expect(ids).toContain('connections')
    expect(ids).toContain('calibration')
  })

  it('geometry group has select, space, and hallway', () => {
    const geom = INTERIOR_TOOL_GROUPS.find((g) => g.id === 'geometry')
    expect(geom?.tools.map((t) => t.id)).toEqual(['select', 'space', 'hallway'])
  })
})

describe('CAMPUS_TOOL_GROUPS', () => {
  it('has geometry group only', () => {
    const ids = CAMPUS_TOOL_GROUPS.map((g) => g.id)
    expect(ids).toEqual(['geometry'])
  })

  it('geometry group has select, building, route, and boundary', () => {
    const geom = CAMPUS_TOOL_GROUPS.find((g) => g.id === 'geometry')
    expect(geom?.tools.map((t) => t.id)).toEqual(['select', 'building', 'route', 'boundary'])
  })
})
