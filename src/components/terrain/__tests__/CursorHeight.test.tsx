import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { TerrainSampler } from '@navi/core'
import { CursorHeight } from '../CursorHeight'

afterEach(cleanup)

function fakeMap() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const handlers = new Map<string, Array<(event: unknown) => void>>()
  return {
    on(type: string, fn: (event: unknown) => void) { handlers.set(type, [...(handlers.get(type) ?? []), fn]) },
    off(type: string, fn: (event: unknown) => void) { handlers.set(type, (handlers.get(type) ?? []).filter((f) => f !== fn)) },
    fire(type: string, event?: unknown) { for (const fn of handlers.get(type) ?? []) fn(event) },
    getContainer: () => container,
    count: (type: string) => (handlers.get(type) ?? []).length,
  }
}

const sampler = { grid: { originLat: 11.8, originLng: 122.1 }, heightAt: () => 12.36 } as unknown as TerrainSampler

describe('CursorHeight', () => {
  it('shows the ground height next to the pointer and hides when the pointer leaves the map', () => {
    const map = fakeMap()
    render(<CursorHeight map={map as never} sampler={sampler} />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => map.fire('mousemove', { lngLat: { lat: 11.8001, lng: 122.1001 }, point: { x: 100, y: 50 } }))
    const label = screen.getByRole('status')
    expect(label.textContent).toBe('12.4 m')
    expect(label.style.left).toBe('114px')
    act(() => map.fire('mouseout'))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('nothing without ground, and it lets go of the map when removed', () => {
    const map = fakeMap()
    const { unmount } = render(<CursorHeight map={map as never} sampler={null} />)
    act(() => map.fire('mousemove', { lngLat: { lat: 11.8, lng: 122.1 }, point: { x: 1, y: 1 } }))
    expect(screen.queryByRole('status')).toBeNull()
    unmount()
    expect(map.count('mousemove')).toBe(0)
  })

  it('no label where there is no campus ground (past the boundary: sky or far side of a building in 3D)', () => {
    const map = fakeMap()
    const bounds: [[number, number], [number, number]] = [[122.1, 11.8], [122.102, 11.802]]
    render(<CursorHeight map={map as never} sampler={sampler} bounds={bounds} />)
    act(() => map.fire('mousemove', { lngLat: { lat: 11.801, lng: 122.101 }, point: { x: 10, y: 10 } }))
    expect(screen.getByRole('status').textContent).toBe('12.4 m')
    act(() => map.fire('mousemove', { lngLat: { lat: 11.9, lng: 122.3 }, point: { x: 10, y: 10 } }))
    expect(screen.queryByRole('status')).toBeNull()
  })
})

