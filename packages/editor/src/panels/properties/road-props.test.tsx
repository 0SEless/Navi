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

function renderWithDispatcher(road: any, execute = vi.fn(), emit = vi.fn()) {
  const services = {
    get: (name: string) => {
      if (name === 'dispatcher') return { execute }
      if (name === 'eventBus') return { emit }
      return undefined
    },
  }
  return { execute, emit, ...render(
    <EditorProvider context={{ document: {} as any, services }}>
      <RoadProperties road={road} />
    </EditorProvider>,
  ) }
}

describe('RoadProperties', () => {
  it('renders Road header and fields', () => {
    renderWithDispatcher(createRoad())
    expect(screen.getByText('Details')).toBeDefined()
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

  it('calls update with correct color on swatch click', () => {
    const { execute } = renderWithDispatcher(createRoad({ metadata: { color: '#1C6BEB' } }))
    const swatches = screen.getAllByRole('button')
    const greenSwatch = swatches.find(b => b.getAttribute('title') === '#22C55E')
    expect(greenSwatch).toBeDefined()
    fireEvent.click(greenSwatch!)
    expect(execute).toHaveBeenCalledWith({
      id: 'entity.update',
      label: 'Edit Road',
      payload: { entityId: 'rd-1', changes: { metadata: { color: '#22C55E' } } },
    })
  })

  it('emits road.edit event when Edit Road button is clicked', () => {
    const { emit } = renderWithDispatcher(createRoad())
    fireEvent.click(screen.getByText('Edit Road'))
    expect(emit).toHaveBeenCalledWith('road.edit', { roadId: 'rd-1' })
  })

  it('dispatches entity.update when width slider changes', () => {
    const { execute } = renderWithDispatcher(createRoad())
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '12' } })
    expect(execute).toHaveBeenCalledWith({
      id: 'entity.update',
      label: 'Edit Road',
      payload: { entityId: 'rd-1', changes: { width: 12 } },
    })
  })
})
