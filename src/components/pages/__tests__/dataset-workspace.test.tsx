import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import type { CampusDocument } from '@navi/core'
import type { CampusMap } from '@/types/campus-map'

const routerPush = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}))

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href?: unknown
  children?: ReactNode
}

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: LinkProps) => (
    <a href={typeof href === 'string' ? href : String(href)} {...rest}>
      {children}
    </a>
  ),
}))

import { DatasetWorkspace } from '../DatasetWorkspace'
import { makeCampusDocument } from './dataset-fixture'

const mockMap = (): CampusMap => ({
  id: 'map-ds-1',
  name: 'ASU Ibajay',
  schoolName: 'ASU',
  campusName: 'Ibajay Campus',
  center: { lat: 10, lng: 20 },
  boundary: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  stats: { buildings: 8, nodes: 100, edges: 148 },
})

const renderWorkspace = (document: CampusDocument | null = makeCampusDocument()) =>
  render(<DatasetWorkspace campus={mockMap()} document={document} />)

const explorer = () => within(screen.getByRole('navigation', { name: 'Dataset Explorer' }))
const panel = () => within(screen.getByRole('tabpanel'))
const location = () => screen.getByTestId('dataset-current-location').textContent

describe('DatasetExplorer', () => {
  it('starts at the campus root with the campus selected', () => {
    renderWorkspace()
    expect(location()).toBe('ASU Ibajay')
    expect(explorer().getByRole('button', { name: 'ASU Ibajay' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('lists only buildings that exist in the authored document (no invented entities)', () => {
    renderWorkspace()
    expect(explorer().getByText('Computer Science Building')).toBeDefined()
    expect(explorer().getByText('Storage Annex')).toBeDefined()
    expect(explorer().queryByText('Neverland Hall')).toBeNull()
  })

  it('shows an honest empty state when the document has no authored buildings', () => {
    renderWorkspace(makeCampusDocument({ buildings: [] }))
    expect(screen.getByText('No authored buildings are available for this campus.')).toBeDefined()
    expect(screen.queryByText('Computer Science Building')).toBeNull()
  })

  it('expands a building to reveal its floors and selects a floor', () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Computer Science Building' }))
    expect(explorer().getByRole('button', { name: 'Ground Floor' })).toBeDefined()
    expect(explorer().getByRole('button', { name: 'Second Floor' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Second Floor' }))
    expect(location()).toBe('ASU Ibajay / Computer Science Building / Second Floor')
    expect(explorer().getByRole('button', { name: 'Second Floor' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('expanding a building does not change the current selection', () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Storage Annex' }))
    expect(location()).toBe('ASU Ibajay')
    expect(explorer().getByRole('button', { name: 'ASU Ibajay' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('shows an honest empty state for a building with no authored floors', () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Storage Annex' }))
    expect(screen.getByText('This building has no authored floors.')).toBeDefined()
  })

  it('lists outdoor POIs and areas as selectable items', () => {
    renderWorkspace()
    expect(explorer().getByRole('button', { name: /Main Gate/ })).toBeDefined()
    expect(explorer().getByRole('button', { name: /Quadrangle/ })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /Quadrangle/ }))
    expect(location()).toBe('ASU Ibajay / Quadrangle')
    expect(panel().getByText('Outdoor area')).toBeDefined()
    expect(panel().queryByText('Outdoor POI')).toBeNull()
  })

  it('degrades honestly when no authored document is available', () => {
    renderWorkspace(null)
    expect(
      screen.getAllByText('Authored document is not available for this campus.').length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { level: 1, name: 'Dataset Management' })).toBeDefined()
    expect(screen.queryByText('Computer Science Building')).toBeNull()
    expect(panel().getByText(/The authored document is not available/)).toBeDefined()
  })

  it('shows a recovery notice when the selected location no longer exists', () => {
    const { rerender } = renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Computer Science Building' }))
    expect(location()).toBe('ASU Ibajay / Computer Science Building')

    // The authored document changes underneath the selection (entity deleted).
    rerender(<DatasetWorkspace campus={mockMap()} document={makeCampusDocument({ buildings: [] })} />)
    expect(screen.getByTestId('dataset-selection-missing')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Select campus' }))
    expect(screen.queryByTestId('dataset-selection-missing')).toBeNull()
    expect(location()).toBe('ASU Ibajay')
  })
})

describe('DatasetWorkspace header building count', () => {
  // Regression: the header subtitle used to render the stale
  // `campus.stats.buildings` metadata (8 here, 29 in production for
  // ASU-Ibajay) while Explorer and Information already showed the
  // authoritative document count. The header must use the same
  // authoritative count via getCampusDisplayStats.
  it('shows the authoritative document building count, not stale campus.stats', () => {
    renderWorkspace()
    // mockMap().stats.buildings is 8; the authored fixture has 2 buildings.
    expect(screen.getByText(/2 buildings/)).toBeDefined()
    expect(screen.queryByText(/8 buildings/)).toBeNull()
  })

  it('keeps the campus.stats fallback when no document is available', () => {
    renderWorkspace(null)
    expect(screen.getByText(/8 buildings/)).toBeDefined()
    expect(screen.queryByText(/2 buildings/)).toBeNull()
  })

  it('agrees with the Explorer badge and the Information field on the same count', () => {
    renderWorkspace()

    // Header subtitle: "ASU · Ibajay Campus · 2 buildings"
    expect(screen.getByText(/ASU · Ibajay Campus · 2 buildings/)).toBeDefined()

    // Explorer "Buildings" section badge.
    expect(explorer().getByText('Buildings').parentElement?.textContent).toBe('Buildings2')

    // Information view "Authored buildings" field.
    expect(screen.getByText('Authored buildings').parentElement?.textContent).toBe(
      'Authored buildings2',
    )
  })
})

describe('DatasetWorkspace content tabs', () => {
  it('keeps the current floor location when switching supported content tabs', () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Computer Science Building' }))
    fireEvent.click(screen.getByRole('button', { name: 'Second Floor' }))
    expect(screen.queryByRole('tab', { name: 'Images' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Dataset' }))
    expect(location()).toBe('ASU Ibajay / Computer Science Building / Second Floor')
    expect(panel().getByText('No rooms are authored on this floor.')).toBeDefined()
    // Images never lists panorama assets as general images.
    expect(panel().queryByText('Main Gate View')).toBeNull()
    expect(panel().queryByText('CS Lobby')).toBeNull()
  })

  it('lists real authored campus records in the Dataset tab', () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: 'Dataset' }))
    expect(panel().getAllByText('Computer Science Building').length).toBeGreaterThan(0)
    expect(panel().getByText('Storage Annex')).toBeDefined()
    expect(panel().getByText('Quadrangle')).toBeDefined()
    expect(panel().getByText('No roads are authored for this campus.')).toBeDefined()
  })

  it('shows authored rooms and indoor POIs for a floor in the Dataset tab', () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Computer Science Building' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ground Floor' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Dataset' }))
    expect(panel().getByText('Room 101')).toBeDefined()
    expect(panel().getByText('Help Desk')).toBeDefined()

    // Switching floors updates the same tab without resetting it.
    fireEvent.click(screen.getByRole('button', { name: 'Second Floor' }))
    expect(panel().getByText('No rooms are authored on this floor.')).toBeDefined()
    expect(panel().queryByText('Room 101')).toBeNull()
  })

  it('lists all document panoramas for the campus scope in the 360 tab', () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: '360' }))
    expect(panel().getByText('Main Gate View')).toBeDefined()
    expect(panel().getByText('CS Lobby')).toBeDefined()
  })

  it('lists a building panorama for a building scope in the 360 tab', () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: '360' }))
    fireEvent.click(screen.getByRole('button', { name: 'Computer Science Building' }))
    expect(panel().getByText('CS Lobby')).toBeDefined()
    expect(panel().queryByText('Main Gate View')).toBeNull()
  })

  it('matches panoramas to floors by level in the 360 tab', () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: '360' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand Computer Science Building' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ground Floor' }))
    expect(panel().getByText('No Virtual Tour scenes for this selection')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Second Floor' }))
    expect(panel().getByText('CS Lobby')).toBeDefined()
  })

  it('hides unsupported outdoor scene scope and recovers to Information', () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: '360' }))
    // Scoped to the explorer sidebar: the 360 panel now also renders a per-row action
    // whose accessible name contains the panorama label.
    fireEvent.click(
      within(screen.getByRole('complementary')).getByRole('button', { name: /Main Gate/ }),
    )
    expect(screen.queryByRole('tab', { name: '360' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Information' }).getAttribute('aria-selected')).toBe('true')
  })

  it('offers Edit Scenes in Studio from the 360 tab and opens the campus Studio editor', () => {
    routerPush.mockClear()
    renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: '360' }))

    fireEvent.click(panel().getByRole('button', { name: 'Edit Scenes in Studio' }))
    expect(routerPush).toHaveBeenCalledTimes(1)
    expect(routerPush).toHaveBeenCalledWith('/studio/map-ds-1/edit')
  })

  it('keeps Edit Scenes in Studio available after switching to a building scope', () => {
    routerPush.mockClear()
    renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: '360' }))
    fireEvent.click(screen.getByRole('button', { name: 'Computer Science Building' }))

    fireEvent.click(panel().getByRole('button', { name: 'Edit Scenes in Studio' }))
    expect(routerPush).toHaveBeenCalledWith('/studio/map-ds-1/edit')
  })

  it('opens a specific panorama from the 360 tab row action at campus scope', () => {
    routerPush.mockClear()
    renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: '360' }))

    fireEvent.click(panel().getByRole('button', { name: 'Open Main Gate View in Virtual Tour' }))
    expect(routerPush).toHaveBeenCalledTimes(1)
    expect(routerPush).toHaveBeenCalledWith(
      '/panoramas?campus=map-ds-1&pano=pan-out-1',
    )
  })

  it('opens a specific panorama from the 360 tab row action at building scope', () => {
    routerPush.mockClear()
    renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: '360' }))
    fireEvent.click(screen.getByRole('button', { name: 'Computer Science Building' }))

    fireEvent.click(panel().getByRole('button', { name: 'Open CS Lobby in Virtual Tour' }))
    expect(routerPush).toHaveBeenCalledWith(
      '/panoramas?campus=map-ds-1&pano=pan-in-1',
    )
  })
})
