import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { EditorProvider } from '../../context'
import { BuildingProperties } from './building-props'

afterEach(cleanup)

function createBuilding(overrides = {}) {
  return {
    id: 'bld-1',
    name: 'Main Building',
    code: 'MB',
    category: 'academic',
    description: 'The main campus building',
    color: '#4A90D9',
    baseElevation: 0,
    height: 20,
    ...overrides,
  }
}

function renderWithDispatcher(building: any, execute = vi.fn()) {
  const services = {
    get: (name: string) => (name === 'dispatcher' ? { execute } : undefined),
  }
  return { execute, ...render(
    <EditorProvider context={{ document: {} as any, services }}>
      <BuildingProperties building={building} />
    </EditorProvider>,
  ) }
}

describe('BuildingProperties', () => {
  it('renders Building header and form fields', () => {
    renderWithDispatcher(createBuilding())
    expect(screen.getByText('Building')).toBeDefined()
    expect(screen.getByDisplayValue('Main Building')).toBeDefined()
    expect(screen.getByDisplayValue('MB')).toBeDefined()
    expect(screen.getByDisplayValue('The main campus building')).toBeDefined()
  })

  it('renders category select with academic selected', () => {
    renderWithDispatcher(createBuilding({ category: 'residential' }))
    const select = screen.getByDisplayValue('residential') as HTMLSelectElement
    expect(select).toBeDefined()
    expect(select.tagName).toBe('SELECT')
  })

  it('dispatches entity.update when name changes', () => {
    const { execute } = renderWithDispatcher(createBuilding())
    fireEvent.change(screen.getByDisplayValue('Main Building'), { target: { value: 'New Name' } })
    expect(execute).toHaveBeenCalledWith({
      id: 'entity.update',
      label: 'Edit Building',
      payload: { entityId: 'bld-1', changes: { name: 'New Name' } },
    })
  })

  it('dispatches entity.update when category changes', () => {
    const { execute } = renderWithDispatcher(createBuilding())
    fireEvent.change(screen.getByDisplayValue('academic'), { target: { value: 'library' } })
    expect(execute).toHaveBeenCalledWith({
      id: 'entity.update',
      label: 'Edit Building',
      payload: { entityId: 'bld-1', changes: { category: 'library' } },
    })
  })
})
