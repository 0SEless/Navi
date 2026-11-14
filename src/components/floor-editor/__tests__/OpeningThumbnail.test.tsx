import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DOOR_PRESETS, findDoorPreset } from '@navi/core'
import { OpeningThumbnail } from '../OpeningThumbnail'
afterEach(cleanup)

it('renders one svg per preset with aria-label = preset label', () => {
  render(<div>{DOOR_PRESETS.map(p => <OpeningThumbnail key={p.id} preset={p} size={64} />)}</div>)
  for (const p of DOOR_PRESETS) {
    const svg = screen.getByRole('img', { name: p.label })
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(svg.getAttribute('width')).toBe('64')
  }
  expect(document.querySelectorAll('svg')).toHaveLength(DOOR_PRESETS.length)
})

it('fire preset shows the red F', () => {
  const { container } = render(<OpeningThumbnail preset={findDoorPreset('door.fire.single')!} size={64} />)
  const text = container.querySelector('text')!
  expect(text.textContent).toBe('F')
  expect(text.getAttribute('fill')).toBe('#B91C1C')
})

it('sliding preset shows an arrow', () => {
  const { container } = render(<OpeningThumbnail preset={findDoorPreset('door.glass.sliding')!} size={64} />)
  expect(container.querySelector('[data-kind="arrow"]')).not.toBeNull()
  const hinged = render(<OpeningThumbnail preset={findDoorPreset('door.wood.single')!} size={64} />)
  expect(hinged.container.querySelector('[data-kind="arrow"]')).toBeNull()
  expect(hinged.container.querySelector('[data-kind="arc"]')).not.toBeNull()
})

it('renders every window preset with its label, a plan view and an elevation', async () => {
  const { WINDOW_PRESETS } = await import('@navi/core')
  render(<div>{WINDOW_PRESETS.map(p => <OpeningThumbnail key={p.id} preset={p} size={64} />)}</div>)
  for (const p of WINDOW_PRESETS) expect(screen.getByRole('img', { name: p.label })).toBeTruthy()
  const jalousie = render(<OpeningThumbnail preset={WINDOW_PRESETS.find(p => p.id === 'window.jalousie')!} size={64} />)
  expect(jalousie.container.querySelector('[data-kind="window-hatch"]')).not.toBeNull()
  expect(jalousie.container.querySelectorAll('[data-part="slat"]').length).toBeGreaterThanOrEqual(6)
})
