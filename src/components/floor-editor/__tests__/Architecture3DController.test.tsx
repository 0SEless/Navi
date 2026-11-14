import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { Floor } from '@navi/core'
import { Architecture3DController } from '../Architecture3DController'
const projectionState = vi.hoisted(() => ({valid:true,listener:undefined as undefined|(()=>void)}))

vi.mock('@navi/editor', () => ({ genId: () => 'new-window' }))
vi.mock('../architecture-3d-projection', () => ({ createArchitectureProjection: () => {
  const snapshot = { project: (p: { x: number; z: number }) => ({ x: p.x*10, y: p.z*10 }), ray: (p: { x: number; y: number }) => ({ origin: { x: p.x/10, y: -10, z: p.y/10 }, direction: { x: 0, y: 1, z: 0 } }) }
  return { ...snapshot, capture: () => projectionState.valid ? snapshot : null, subscribe: (fn:()=>void) => {projectionState.listener=fn;return () => {}}, dispose: vi.fn() }
} }))
afterEach(cleanup)
function fixture() {
  projectionState.valid=true
  const floor = { id: 'f', level: 2, elevation: 7, walls: [{ id: 'w', start: { x: 0, y: 0 }, end: { x: 6, y: 0 }, thickness: .2, height: 3.5 }], openings: [], rooms: [], doors: [] } as unknown as Floor
  const container = document.createElement('div'), canvas = document.createElement('div');container.appendChild(canvas);document.body.appendChild(container)
  const handlers: Record<string, () => void> = {}
  const control = (enabled = true) => ({ isEnabled: () => enabled, enable: vi.fn(), disable: vi.fn() })
  const map = { getContainer: () => canvas, on: (name: string, fn: () => void) => {handlers[name]=fn}, off: vi.fn(), dragPan: control(), dragRotate: control(false), scrollZoom: control(), boxZoom: control(), doubleClickZoom: control(), keyboard: control(), touchZoomRotate: control() }
  container.setPointerCapture=vi.fn();container.hasPointerCapture=()=>false;container.releasePointerCapture=vi.fn()
  const props = { map, transformer: {}, buildingId: 'b', floor, tool: 'window', onSelect: vi.fn(), onWallSelect: vi.fn(), onPreview: vi.fn(), execute: vi.fn(() => ({ success: true })) } as unknown as ComponentProps<typeof Architecture3DController>
  const mount = document.createElement('div');container.appendChild(mount)
  const view = render(<Architecture3DController {...props} />, { container: mount })
  const pointer = (name: string, x: number, y: number) => act(() => {
    const event = new MouseEvent(name, { bubbles: true, clientX: x, clientY: y, button: 0 });Object.defineProperty(event,'pointerId',{value:1});canvas.dispatchEvent(event)
  })
  return { props, map, handlers, pointer, view, container }
}
describe('facade controller commands and cancellation', () => {
  it('selects visible asset entities instead of generated piece IDs and never edits them', () => {
    const f=fixture()
    const asset:GeoJSON.Feature<GeoJSON.Polygon>={type:'Feature',properties:{featureId:'stair',id:'stair:step:0',base:0,height:2},geometry:{type:'Polygon',coordinates:[[[1,-2],[2,-2],[2,-1],[1,-1],[1,-2]]]}}
    f.view.rerender(<Architecture3DController {...f.props} tool="select" assetFeatures={[asset]} assetSelectionIds={{stair:'stair-0'}}/>)
    f.pointer('pointerdown',15,10);f.pointer('pointerup',15,10)
    expect(f.props.onSelect).toHaveBeenCalledWith('stair-0');expect(f.props.execute).not.toHaveBeenCalled()
  })
  it('previews without document changes, then dispatches one creation', () => {
    const f=fixture(), before=JSON.stringify(f.props.floor)
    f.pointer('pointerdown',10,10);f.pointer('pointermove',25,22)
    expect(f.props.execute).not.toHaveBeenCalled();expect(JSON.stringify(f.props.floor)).toBe(before)
    expect(f.props.onPreview).toHaveBeenCalledWith(expect.objectContaining({openings: [expect.objectContaining({windowAppearance:'fixed',width:1.5})]}))
    f.pointer('pointerup',25,22)
    expect(f.props.execute).toHaveBeenCalledTimes(1)
    expect(f.props.execute).toHaveBeenCalledWith(expect.objectContaining({id:'opening.create',payload:expect.objectContaining({floorId:'f',opening:expect.objectContaining({offset:1,sillHeight:1})})}))
    expect(f.map.dragPan.enable).toHaveBeenCalled();expect(f.map.dragRotate.enable).not.toHaveBeenCalled()
  })
  it.each(['pointercancel','camera','escape','host-change','tool-change','selection-change','projection-loss'])('cancels %s without a command', reason => {
    const f=fixture();f.pointer('pointerdown',10,10);f.pointer('pointermove',25,22)
    if(reason==='pointercancel')f.pointer('pointercancel',25,22)
    if(reason==='camera')act(()=>f.handlers.movestart())
    if(reason==='escape')act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})))
    if(reason==='host-change'){f.props.floor.walls![0].height=4;f.view.rerender(<Architecture3DController {...f.props} />)}
    if(reason==='tool-change')f.view.rerender(<Architecture3DController {...f.props} tool="select" />)
    if(reason==='selection-change')f.view.rerender(<Architecture3DController {...f.props} selectedId="another-window" />)
    if(reason==='projection-loss')act(()=>{projectionState.valid=false;projectionState.listener!()})
    f.pointer('pointerup',25,22)
    expect(f.props.execute).not.toHaveBeenCalled();expect(f.map.dragPan.enable).toHaveBeenCalled()
  })
  it('refuses an invalid rectangle and surfaces command rejection', () => {
    const f=fixture();f.pointer('pointerdown',10,10);f.pointer('pointermove',80,22);f.pointer('pointerup',80,22)
    expect(f.props.execute).not.toHaveBeenCalled()
    vi.mocked(f.props.execute).mockReturnValue({success:false,error:'Conflicting window'})
    f.pointer('pointerdown',10,10);f.pointer('pointermove',25,22);f.pointer('pointerup',25,22)
    expect(f.container.textContent).toContain('Conflicting window')
  })
})
