import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { CampusDocument } from '@navi/core'
import { TerrainStage } from '../TerrainStage'

const maps = vi.hoisted(() => ({ pitches: [] as number[] }))
vi.mock('../TerrainMap', () => ({
  TerrainMap: ({ pitch }: { pitch: number }) => {
    maps.pitches.push(pitch)
    return <div data-terrain-map="stub" />
  },
}))

afterEach(() => {
  cleanup()
  maps.pitches = []
})

describe('TerrainStage', () => {
  it('draws one map, flat to start, with no mini 3D window, Swap or Pop out', () => {
    render(<TerrainStage document={{} as CampusDocument} sampler={null} version={0} view="contours" exaggeration={1} />)
    expect(maps.pitches).toEqual([0])
    expect(document.querySelectorAll('[data-terrain-map]')).toHaveLength(1)
    expect(document.querySelector('[data-terrain-mini]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Swap' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pop out' })).toBeNull()
  })
})
