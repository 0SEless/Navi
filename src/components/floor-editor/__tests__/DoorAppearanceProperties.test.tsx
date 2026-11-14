import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RoomDoor } from '@navi/core'
import { DoorAppearanceProperties } from '../DoorAppearanceProperties'
afterEach(cleanup)
const door:RoomDoor={id:'d',position:{x:1,y:1},width:1,doorType:'standard',metadata:{}}
it('selecting a thumbnail dispatches one door.update {assetPreset}',()=>{
 const update=vi.fn(()=>({success:true}));render(<DoorAppearanceProperties door={door} onUpdate={update}/>)
 fireEvent.click(screen.getByRole('button',{name:'Use Steel door'}));expect(update).toHaveBeenCalledExactlyOnceWith({assetPreset:'door.steel.single'})
})
it('marks the current preset as pressed and shows a refused edit',()=>{
 const update=vi.fn(()=>({success:false,error:'Door changed'}))
 render(<DoorAppearanceProperties door={{...door,assetPreset:'door.wood.single'}} onUpdate={update}/>)
 expect(screen.getByRole('button',{name:'Use Wood door'}).getAttribute('aria-pressed')).toBe('true')
 fireEvent.click(screen.getByRole('button',{name:'Use Glass door'}))
 expect(screen.getByRole('alert').textContent).toContain('Door changed')
})
it('material swatch dispatches {material}',()=>{
 const update=vi.fn(()=>({success:true}));render(<DoorAppearanceProperties door={door} onUpdate={update}/>)
 fireEvent.click(screen.getByRole('button',{name:'Material aluminium'}));expect(update).toHaveBeenCalledExactlyOnceWith({material:'aluminium'})
})
it('glass choice is hidden for presets without glass',()=>{
 const update=vi.fn(()=>({success:true}))
 const view=render(<DoorAppearanceProperties door={{...door,assetPreset:'door.steel.single'}} onUpdate={update}/>)
 expect(screen.queryByLabelText('Glass')).toBeNull()
 view.rerender(<DoorAppearanceProperties door={{...door,assetPreset:'door.glass.single'}} onUpdate={update}/>)
 fireEvent.change(screen.getByLabelText('Glass'),{target:{value:'frosted'}});expect(update).toHaveBeenCalledExactlyOnceWith({glass:'frosted'})
})
it('no Apply button remains; pose select applies on change',()=>{
 const update=vi.fn(()=>({success:true}));render(<DoorAppearanceProperties door={door} onUpdate={update}/>)
 expect(screen.queryByRole('button',{name:/^Apply door appearance$/})).toBeNull()
 expect((screen.getByLabelText('Door position') as HTMLSelectElement).value).toBe('closed')
 fireEvent.change(screen.getByLabelText('Door position'),{target:{value:'open'}});expect(update).toHaveBeenCalledExactlyOnceWith({doorPose:'open'})
})
it('apply-to-similar shows "Apply to 3 similar doors" and asks to confirm before applying',()=>{
 const update=vi.fn(()=>({success:true})),similar=vi.fn(()=>({success:true}))
 render(<DoorAppearanceProperties door={door} onUpdate={update} similarCount={3} onApplyToSimilar={similar}/>)
 fireEvent.click(screen.getByRole('button',{name:'Apply to 3 similar doors'}));expect(similar).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Confirm: change 3 doors'}))
 expect(similar).toHaveBeenCalledExactlyOnceWith(['assetPreset','material','glass','doorPose','doorAppearance'])
 expect(screen.queryByRole('button',{name:'Confirm: change 3 doors'})).toBeNull()
})
it('hides apply-to-similar when no door matches, and archways lock every look control',()=>{
 const update=vi.fn(()=>({success:true}))
 render(<DoorAppearanceProperties door={{...door,doorType:'opening'}} onUpdate={update} similarCount={0} onApplyToSimilar={vi.fn()}/>)
 expect(screen.queryByRole('button',{name:/similar doors/})).toBeNull()
 for(const name of ['Use Steel door','Material wood'])expect((screen.getByRole('button',{name}) as HTMLButtonElement).disabled).toBe(true)
 expect((screen.getByLabelText('Door position') as HTMLSelectElement).disabled).toBe(true)
})
it('Hinge toggle sends {hingeSide:"end"} immediately',()=>{
 const update=vi.fn(()=>({success:true}));render(<DoorAppearanceProperties door={door} onUpdate={update}/>)
 fireEvent.click(screen.getByRole('button',{name:'Hinge at end'}));expect(update).toHaveBeenCalledExactlyOnceWith({hingeSide:'end'})
 expect(screen.getByRole('button',{name:'Hinge at start'}).getAttribute('aria-pressed')).toBe('true')
})
it('Swing toggle sends {swingSide:"right"}',()=>{
 const update=vi.fn(()=>({success:true}));render(<DoorAppearanceProperties door={door} onUpdate={update}/>)
 fireEvent.click(screen.getByRole('button',{name:'Swing right'}));expect(update).toHaveBeenCalledExactlyOnceWith({swingSide:'right'})
})
it('Flip swaps swingSide (absent -> right, right -> left)',()=>{
 const update=vi.fn(()=>({success:true}));const view=render(<DoorAppearanceProperties door={door} onUpdate={update}/>)
 fireEvent.click(screen.getByRole('button',{name:'Flip swing'}));expect(update).toHaveBeenLastCalledWith({swingSide:'right'})
 view.rerender(<DoorAppearanceProperties door={{...door,swingSide:'right'}} onUpdate={update}/>)
 fireEvent.click(screen.getByRole('button',{name:'Flip swing'}));expect(update).toHaveBeenLastCalledWith({swingSide:'left'})
})
it('F key flips once; ignored while typing in an input',()=>{
 const update=vi.fn(()=>({success:true}));render(<><input aria-label="other"/><DoorAppearanceProperties door={door} onUpdate={update}/></>)
 fireEvent.keyDown(screen.getByLabelText('other'),{key:'f'});expect(update).not.toHaveBeenCalled()
 fireEvent.keyDown(window,{key:'f'});expect(update).toHaveBeenCalledExactlyOnceWith({swingSide:'right'})
})
it('archway and disabled states disable hinge, swing and flip',()=>{
 const update=vi.fn(()=>({success:true}))
 for(const props of [{door:{...door,doorType:'opening' as const}},{door,disabled:true}]){
  const view=render(<DoorAppearanceProperties {...props} onUpdate={update}/>)
  for(const name of ['Hinge at end','Swing right','Flip swing'])expect((screen.getByRole('button',{name}) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.keyDown(window,{key:'f'});view.unmount()
 }
 expect(update).not.toHaveBeenCalled()
})
it('double door hides Hinge, keeps Swing and Flip',()=>{
 render(<DoorAppearanceProperties door={{...door,doorType:'double'}} onUpdate={vi.fn(()=>({success:true}))}/>)
 expect(screen.queryByRole('button',{name:'Hinge at end'})).toBeNull()
 expect(screen.getByRole('button',{name:'Swing right'})).toBeTruthy();expect(screen.getByRole('button',{name:'Flip swing'})).toBeTruthy()
})
