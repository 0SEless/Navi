import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContextHeader, type ContextHeaderProps } from '../ContextHeader'

function renderHeader(props?: Partial<ContextHeaderProps>) {
  return render(
    <ContextHeader
      mapId="test-campus"
      buildingName="Engineering Building"
      floorLabel="GF"
      status="saved"
      {...props}
    />,
  )
}

describe('ContextHeader', () => {
  it('renders building name and floor label', () => {
    renderHeader()
    expect(screen.getByText('Engineering Building')).toBeDefined()
    expect(screen.getByText('GF')).toBeDefined()
  })

  it('renders back link to campus workspace', () => {
    renderHeader()
    const link = screen.getByText('Campus').closest('a')
    expect(link?.getAttribute('href')).toBe('/studio/test-campus/edit')
  })

  it('shows saved status', () => {
    renderHeader({ status: 'saved' })
    expect(screen.getByText((c) => c.includes('Saved'))).toBeDefined()
  })

  it('shows saving status', () => {
    renderHeader({ status: 'saving' })
    expect(screen.getByText((c) => c.includes('Saving'))).toBeDefined()
  })

  it('shows error status with message', () => {
    renderHeader({ status: 'error', statusMessage: 'network error' })
    const el = screen.getByText((c) => c.includes('Sync failed'))
    expect(el).toBeDefined()
    expect(el.getAttribute('title')).toBe('network error')
  })

  it('shows selection count when > 1', () => {
    renderHeader({ selectedCount: 3 })
    expect(screen.getByText('3 selected')).toBeDefined()
  })

  it('hides selection count when <= 1', () => {
    renderHeader({ selectedCount: 1 })
    expect(screen.queryByText((c) => c.includes('selected'))).toBeNull()
  })

  it('handles empty building name', () => {
    renderHeader({ buildingName: '' })
    expect(screen.getByText('/')).toBeDefined()
  })
})
