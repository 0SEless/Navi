import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { EditorProvider } from '../../context'
import { RoadProperties } from './road-props'

afterEach(cleanup)

function createRoad(overrides = {}) {
  return {
    id: 'rd-1',
    name: 'Main Road',
    width: 6,
    surface: 'paved',
    type: 'arterial',
    ...overrides,
  }
}

function renderWithDispatcher(road: any, execute = vi.fn()) {
  const services = {
    get: (name: string) => (name === 'dispatcher' ? { execute } : undefined),
  }
  return { execute, ...render(
    <EditorProvider context={{ document: {} as any, services }}>
      <RoadProperties road={road} />
    </EditorProvider>,
  ) }
}

describe('RoadProperties', () => {
  it('renders Road header and fields', () => {
    renderWithDispatcher(createRoad())
    expect(screen.getByText('Road')).toBeDefined()
    expect(screen.getByDisplayValue('Main Road')).toBeDefined()
    expect(screen.getByText('6m')).toBeDefined()
  })

  it('dispatches entity.update when name changes', () => {
    const { execute } = renderWithDispatcher(createRoad())
    fireEvent.change(screen.getByDisplayValue('Main Road'), { target: { value: 'Side Road' } })
    expect(execute).toHaveBeenCalledWith({
      id: 'entity.update',
      label: 'Edit Road',
      payload: { entityId: 'rd-1', changes: { name: 'Side Road' } },
    })
  })
})
