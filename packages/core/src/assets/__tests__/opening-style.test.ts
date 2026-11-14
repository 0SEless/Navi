import { describe, expect, it } from 'vitest'
import { resolveDoorStyle } from '../opening-style'

describe('resolveDoorStyle', () => {
  it('standard door with no style fields renders like today', () => {
    expect(resolveDoorStyle({ doorType: 'standard' })).toEqual({ operation: 'hinged', leaves: 1, hingeSide: 'start', swingSide: 'left', pose: 'closed', panel: 'solid', material: null, glass: 'clear', fire: false })
  })
  it('double door has two solid leaves', () => {
    expect(resolveDoorStyle({ doorType: 'double' })).toMatchObject({ operation: 'hinged', leaves: 2, panel: 'solid' })
  })
  it('sliding door type slides', () => {
    expect(resolveDoorStyle({ doorType: 'sliding' }).operation).toBe('sliding')
  })
  it('fire door is hinged and marked fire', () => {
    expect(resolveDoorStyle({ doorType: 'fire' })).toMatchObject({ operation: 'hinged', fire: true })
  })
  it('archway wins over a stored hinged operation', () => {
    expect(resolveDoorStyle({ doorType: 'opening', doorOperation: 'hinged' })).toMatchObject({ operation: 'none', panel: 'none' })
  })
  it('glass appearance gives a glass panel', () => {
    expect(resolveDoorStyle({ doorType: 'standard', doorAppearance: 'glass' }).panel).toBe('glass')
  })
  it('double-glass appearance gives two glass leaves', () => {
    expect(resolveDoorStyle({ doorType: 'standard', doorAppearance: 'double-glass' })).toMatchObject({ leaves: 2, panel: 'glass' })
  })
  it('open appearance means no leaf', () => {
    expect(resolveDoorStyle({ doorType: 'standard', doorAppearance: 'open' })).toMatchObject({ operation: 'none', panel: 'none' })
  })
  it('explicit folding operation on a standard door folds', () => {
    expect(resolveDoorStyle({ doorType: 'standard', doorOperation: 'folding' }).operation).toBe('folding')
  })
  it('keeps explicit hinge, swing and pose', () => {
    expect(resolveDoorStyle({ doorType: 'standard', hingeSide: 'end', swingSide: 'right', doorPose: 'ajar' })).toMatchObject({ hingeSide: 'end', swingSide: 'right', pose: 'ajar' })
  })
})

describe('resolveWindowStyle (Task 13)', () => {
  it('absent fields resolve to today\'s open window, closed, no material, clear glass', async () => {
    const { resolveWindowStyle } = await import('../opening-style')
    expect(resolveWindowStyle({})).toEqual({ type: 'open', pose: 'closed', material: null, glass: 'clear' })
    expect(resolveWindowStyle({ windowAppearance: 'two-pane' }).type).toBe('two-pane')
  })
  it('a preset wins over the stored windowAppearance and supplies material/glass defaults', async () => {
    const { resolveWindowStyle } = await import('../opening-style')
    expect(resolveWindowStyle({ windowAppearance: 'fixed', assetPreset: 'window.jalousie' })).toMatchObject({ type: 'jalousie', material: 'aluminium' })
    expect(resolveWindowStyle({ assetPreset: 'window.casement', windowPose: 'open', glass: 'tinted' })).toMatchObject({ type: 'casement', pose: 'open', glass: 'tinted' })
  })
  it('catalog has the 9 window presets; transom sits at sill 2.1 m', async () => {
    const { WINDOW_PRESETS, findWindowPreset } = await import('../opening-catalog')
    expect(WINDOW_PRESETS.map(p => p.id)).toEqual(['window.fixed', 'window.two-pane', 'window.sliding', 'window.casement', 'window.awning', 'window.jalousie', 'window.transom', 'window.vent-block', 'window.open'])
    expect(findWindowPreset('window.transom')!.defaultSill).toBe(2.1)
    expect(findWindowPreset('door.wood.single')).toBeUndefined()
  })
})

describe('final review fixes', () => {
  it('a chosen door preset wins over the legacy open appearance on a real door (not over doorType opening)', async () => {
    const { resolveDoorStyle } = await import('../opening-style')
    expect(resolveDoorStyle({ doorType: 'standard', doorAppearance: 'open', assetPreset: 'door.wood.single' }).operation).toBe('hinged')
    expect(resolveDoorStyle({ doorType: 'standard', doorAppearance: 'open' }).operation).toBe('none')
    expect(resolveDoorStyle({ doorType: 'opening', assetPreset: 'door.wood.single' }).operation).toBe('none')
  })
})
