import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Panorama } from '@navi/core'
import { buildPanoramaViews } from '../selectors'
import { VirtualTourWorkspace } from './VirtualTourWorkspace'

vi.mock('@/components/tour/TourViewer', () => ({ TourViewer: (props: { onPanoramaChange?: (index: number) => void }) => <div data-testid="actual-viewer"><button onClick={() => props.onPanoramaChange?.(1)}>Transition fixture</button></div> }))
const scenes: Panorama[] = [
  { id: 'a', label: 'Lobby', imageAssetId: 'opaque-image', position: { lat: 0, lng: 0 }, heading: 0, hotspots: [] },
  { id: 'b', label: 'Courtyard', imageAssetId: '', position: { lat: 0, lng: 0 }, heading: 0, hotspots: [] },
]
const inventory = buildPanoramaViews({ panoramas: scenes, buildings: [] } as unknown as Parameters<typeof buildPanoramaViews>[0])
beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))))
function setup(requestedSceneId: string | null = 'a') {
  const onSceneSelect = vi.fn()
  render(<VirtualTourWorkspace phase={{ kind: 'ready', empty: 'none' }} campuses={[{ id: 'c', name: 'Campus' }]} selectedCampusId="c" panoramas={scenes} inventory={inventory} results={inventory} requestedSceneId={requestedSceneId} query="" onQueryChange={vi.fn()} onCampusChange={vi.fn()} onSceneSelect={onSceneSelect} onRetry={vi.fn()} />)
  return onSceneSelect
}
describe('dedicated tour workspace', () => {
  it('closes the compact scene panel with Escape and returns focus to its opener', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    setup()
    const opener = screen.getByRole('button', { name: 'Scenes' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByRole('dialog', { name: 'Scene explorer' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(document.activeElement).toBe(opener)
  })
  it('shows the viewer, canonical scene details, and an explicit Studio authoring route', () => {
    setup()
    expect(screen.getByTestId('actual-viewer')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Select scene Lobby' })).toBeTruthy()
    expect(screen.getByText('Scene ID')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Edit Scenes in Studio' })).toHaveAttribute('href', '/studio/c/edit')
    expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull()
  })
  it('does not silently select a missing or unspecified scene', () => {
    setup('unknown')
    expect(screen.getByText('Scene not found')).toBeTruthy()
    expect(screen.queryByTestId('actual-viewer')).toBeNull()
  })
  it('preview removes authoring panels, keeps viewer, and returns to editor', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Preview Tour' }))
    expect(screen.queryByRole('button', { name: 'Select scene Lobby' })).toBeNull()
    expect(screen.getByTestId('actual-viewer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Exit Preview' }))
    expect(screen.getByRole('button', { name: 'Select scene Lobby' })).toBeTruthy()
  })
  it('Escape exits preview, restores its opener, and preserves scene selection', () => {
    const select = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Preview Tour' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Preview Tour' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Preview Tour' }))
    expect(select).not.toHaveBeenCalled()
  })
  it('transitions remain in the workspace through the canonical scene callback', () => {
    const select = setup()
    fireEvent.click(screen.getByText('Transition fixture'))
    expect(select).toHaveBeenCalledWith('b')
  })
  it('keeps scene authoring controls out of the read-only management workspace', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Navigation Hotspot' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Information Hotspot' })).toBeNull()
    expect(screen.getByText('Manage panorama scenes and hotspots in NAVI Studio.')).toBeTruthy()
  })
})
