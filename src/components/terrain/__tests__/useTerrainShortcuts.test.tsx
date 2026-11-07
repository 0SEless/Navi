import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, renderHook } from '@testing-library/react'
import { useTerrainShortcuts } from '../useTerrainShortcuts'
import { TERRAIN_TOOLS, TerrainToolRail } from '../TerrainToolRail'

afterEach(cleanup)

function setup(opts: { enabled?: boolean; heightMode?: boolean; stairs?: boolean } = {}) {
  const setTool = vi.fn()
  renderHook(() => useTerrainShortcuts({
    enabled: opts.enabled ?? true, heightMode: opts.heightMode ?? false, stairsAvailable: opts.stairs ?? true,
    history: undefined, setTool, setSettings: vi.fn(),
  }))
  return setTool
}

const press = (key: string, extra: Record<string, unknown> = {}) => fireEvent.keyDown(window, { key, ...extra })

describe('one key per tool (section 4)', () => {
  it('each listed key selects its tool', () => {
    const setTool = setup()
    const expected: Record<string, string> = {
      v: 'pan', b: 'raise-lower', s: 'smooth', f: 'flatten', p: 'slope', l: 'lasso', u: 'pad',
      t: 'stairs', h: 'picker', r: 'reset', c: 'contour-pen', e: 'boundary',
    }
    for (const [key, tool] of Object.entries(expected)) {
      press(key)
      expect(setTool).toHaveBeenLastCalledWith(tool)
    }
    expect(setTool).toHaveBeenCalledTimes(12)
  })

  it('typing in a field, Ctrl/Alt/Meta or Shift, and height mode never switch tools', () => {
    const setTool = setup()
    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: 's' })
    press('s', { ctrlKey: true })
    press('s', { altKey: true })
    press('s', { metaKey: true })
    press('S', { shiftKey: true })
    expect(setTool).not.toHaveBeenCalled()
    cleanup()
    const inHeightMode = setup({ heightMode: true })
    press('s')
    press('v')
    expect(inHeightMode).not.toHaveBeenCalled()
  })

  it('a ticked checkbox or a pressed button is not typing: keys still switch tools', () => {
    const setTool = setup()
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    document.body.appendChild(checkbox)
    fireEvent.keyDown(checkbox, { key: 's' })
    expect(setTool).toHaveBeenLastCalledWith('smooth')
    const number = document.createElement('input')
    number.type = 'number'
    document.body.appendChild(number)
    fireEvent.keyDown(number, { key: 'e' })
    expect(setTool).toHaveBeenCalledTimes(1)
  })

  it('without the terrain lock only Move and Stairs switch', () => {
    const setTool = setup({ enabled: false })
    press('b')
    press('e')
    expect(setTool).not.toHaveBeenCalled()
    press('v')
    press('t')
    expect(setTool.mock.calls.map((c) => c[0])).toEqual(['pan', 'stairs'])
    cleanup()
    const noGround = setup({ enabled: false, stairs: false })
    press('t')
    expect(noGround).not.toHaveBeenCalled()
  })

  it('the dock shows each key as a letter on its button and in its tooltip', () => {
    const { getByRole } = render(<TerrainToolRail tool="pan" disabled={false} onTool={() => {}} />)
    for (const entry of TERRAIN_TOOLS) {
      const button = getByRole('button', { name: new RegExp(`^${entry.label}`) })
      expect(button.textContent).toContain(entry.key.toUpperCase())
      expect(button.getAttribute('title')).toMatch(new RegExp(`\\(${entry.key.toUpperCase()}\\)`))
    }
  })
})
