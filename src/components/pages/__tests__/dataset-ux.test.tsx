import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DatasetWorkspace } from '../DatasetWorkspace'
import { makeCampusDocument } from './dataset-fixture'
import type { CampusMap } from '@/types/campus-map'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const campus: CampusMap = {
  id: 'map-ds-1', name: 'ASU Ibajay', schoolName: 'ASU', campusName: 'Ibajay Campus',
  center: { lat: 10, lng: 20 }, boundary: [], createdAt: '2026-01-01', updatedAt: '2026-01-01',
  stats: { buildings: 8, nodes: 100, edges: 148 },
}
const tree = () => within(screen.getByRole('navigation', { name: 'Dataset Explorer' }))
const search = (value: string) => fireEvent.change(screen.getByRole('searchbox', { name: 'Search dataset' }), { target: { value } })

describe('Dataset find → select → inspect workflow', () => {
  it('filters human building names case-insensitively and restores the tree on clear', () => {
    render(<DatasetWorkspace campus={campus} document={makeCampusDocument()} />)
    search('COMPUTER')
    expect(tree().getByText('Computer Science Building')).toBeDefined()
    expect(tree().queryByText('Storage Annex')).toBeNull()
    search('bld-cs')
    expect(tree().queryByText('Computer Science Building')).toBeNull()
    expect(tree().getByText('No matching locations')).toBeDefined()
    search('')
    expect(tree().getByText('Storage Annex')).toBeDefined()
  })
  it('searches floor and indoor POI labels while retaining their building/floor context', () => {
    render(<DatasetWorkspace campus={campus} document={makeCampusDocument()} />)
    search('help desk')
    expect(tree().getByText('Computer Science Building')).toBeDefined()
    expect(tree().getByRole('button', { name: 'Ground Floor' })).toBeDefined()
    expect(tree().getByText('Help Desk')).toBeDefined()
    expect(tree().queryByText('Second Floor')).toBeNull()
    search('second floor')
    fireEvent.click(tree().getByRole('button', { name: 'Second Floor' }))
    expect(screen.getByTestId('dataset-current-location').textContent).toBe('ASU Ibajay / Computer Science Building / Second Floor')
    expect(screen.queryByRole('tab', { name: 'Images' })).toBeNull()
  })
  it('finds an outdoor item and hides unsupported scene associations', () => {
    render(<DatasetWorkspace campus={campus} document={makeCampusDocument()} />)
    search('main gate')
    fireEvent.click(tree().getByRole('button', { name: /Main Gate/ }))
    expect(screen.queryByRole('tab', { name: '360' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Information' })).toBeDefined()
  })
  it('expands and collapses without changing selection and provides full name titles', () => {
    render(<DatasetWorkspace campus={campus} document={makeCampusDocument()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand all buildings' }))
    expect(tree().getByText('Second Floor')).toBeDefined()
    expect(tree().getByRole('button', { name: 'Second Floor' }).title).toBe('Second Floor')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all buildings' }))
    expect(tree().queryByText('Second Floor')).toBeNull()
    expect(screen.getByTestId('dataset-current-location').textContent).toBe('ASU Ibajay')
  })
  it('groups campus facts and falls back to Information when a tab is unsupported', () => {
    render(<DatasetWorkspace campus={campus} document={makeCampusDocument()} />)
    expect(screen.getByRole('heading', { name: 'Campus Details' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Dataset Summary' })).toBeDefined()
    expect(screen.getByText('Technical Details').closest('details')).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: '360' }))
    fireEvent.click(tree().getByRole('button', { name: /Quadrangle/ }))
    expect(screen.getByRole('tab', { name: 'Information' }).getAttribute('aria-selected')).toBe('true')
  })
  it('allows keyboard tab switching and organizes records into collapsible sections', () => {
    render(<DatasetWorkspace campus={campus} document={makeCampusDocument()} />)
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Information' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Images' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'Dataset' }))
    expect(within(screen.getByRole('tabpanel')).getByText(/Buildings/).closest('details')).toBeDefined()
  })
})
