import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TerrainLookSwitch } from '../TerrainLookSwitch'
import { mergePublicPreferences } from '@/lib/public-preferences'
afterEach(cleanup)

it('opens a list of the four looks, marks the active one and the campus default, and picks one', () => {
  const onChange = vi.fn()
  render(<TerrainLookSwitch active="green" campusDefault="green" onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Map look' }))
  const options = screen.getAllByRole('menuitemradio')
  expect(options.map((o) => o.textContent)).toEqual(['Green terraces (campus default)', 'Vivid green', 'Neutral', 'Sand heights'])
  expect(options[0].getAttribute('aria-checked')).toBe('true')
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Sand heights' }))
  expect(onChange).toHaveBeenCalledExactlyOnceWith('sand')
  expect(screen.queryByRole('menuitemradio')).toBeNull()
})

it('choosing the campus default clears the visitor choice', () => {
  const onChange = vi.fn()
  render(<TerrainLookSwitch active="vivid" campusDefault="green" onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Map look' }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Green terraces (campus default)' }))
  expect(onChange).toHaveBeenCalledExactlyOnceWith(null)
})

it('the visitor look is a saved preference; an unknown saved value is dropped', () => {
  expect(mergePublicPreferences({ terrainLook: 'neutral' }).terrainLook).toBe('neutral')
  expect(mergePublicPreferences({ terrainLook: 'purple' })).not.toHaveProperty('terrainLook')
  expect(mergePublicPreferences({})).not.toHaveProperty('terrainLook')
})
