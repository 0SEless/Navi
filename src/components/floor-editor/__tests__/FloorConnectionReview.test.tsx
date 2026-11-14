import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {FloorConnectionReview} from '../FloorConnectionReview'
afterEach(cleanup)
function fixture(){const floor:any={id:'f',level:0,entrances:[],doors:[{id:'door',name:'Door',position:{x:2,y:0},width:1,doorType:'standard',metadata:{},wallAttachment:{wallId:'wall',offset:2,openingHeight:2.1}}],walls:[{id:'wall',start:{x:0,y:0},end:{x:10,y:0},height:3,thickness:.2}],routeNetwork:{nodes:[{id:'a',type:'waypoint',position:{x:0,y:3},floor:0},{id:'b',type:'waypoint',position:{x:10,y:3},floor:0}],edges:[{id:'edge',from:'a',to:'b',type:'walk',distance:10}]}};return {floor,building:{id:'building',floors:[floor],staircases:[],elevators:[]} as any}}
it('keeps suggestions temporary, cancels without mutation and confirms a single batch',()=>{
 const {floor,building}=fixture(),before=JSON.stringify(floor),apply=vi.fn(()=>({success:true,revision:2}))
 render(<FloorConnectionReview floor={floor} building={building} revision={1} onApply={apply} onUndo={vi.fn()}/>)
 fireEvent.click(screen.getByRole('button',{name:'Suggest connections'}));expect(screen.getByRole('dialog',{name:'Review floor connections'})).toBeTruthy();expect(apply).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(JSON.stringify(floor)).toBe(before);expect(apply).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Suggest connections'}));fireEvent.click(screen.getByRole('button',{name:'Confirm connections'}))
 expect(apply).toHaveBeenCalledTimes(1);expect(apply.mock.calls[0][0].connections).toHaveLength(1);expect(apply.mock.calls[0][0].expectedSignature).toBeTruthy()
})
it('blocks stale previews and prevents undoing unrelated subsequent edits',()=>{
 const {floor,building}=fixture(),apply=vi.fn(()=>({success:true,revision:2})),undo=vi.fn();const view=render(<FloorConnectionReview floor={floor} building={building} revision={1} onApply={apply} onUndo={undo}/>)
 fireEvent.click(screen.getByRole('button',{name:'Suggest connections'}));floor.walls[0].height=4
 view.rerender(<FloorConnectionReview floor={floor} building={building} revision={2} onApply={apply} onUndo={undo}/>)
 expect((screen.getByRole('button',{name:'Confirm connections'}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));fireEvent.click(screen.getByRole('button',{name:'Suggest connections'}));fireEvent.click(screen.getByRole('button',{name:'Confirm connections'}))
 view.rerender(<FloorConnectionReview floor={floor} building={building} revision={3} onApply={apply} onUndo={undo}/>)
 expect((screen.getByRole('button',{name:'Undo connections'}) as HTMLButtonElement).disabled).toBe(true)
})
it('includes existing connections only after explicit edit, or disconnects them',()=>{
 const {floor,building}=fixture();floor.doors[0].routeConnection={anchorNodeId:'owned',targetRouteNodeId:'a',connectorEdgeId:'owned-edge'}
 const apply=vi.fn(()=>({success:true,revision:2}));render(<FloorConnectionReview floor={floor} building={building} revision={1} onApply={apply} onUndo={vi.fn()}/>)
 fireEvent.click(screen.getByRole('button',{name:'Suggest connections'}));expect((screen.getByRole('button',{name:'Confirm connections'}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'Disconnect Door'}));fireEvent.click(screen.getByRole('button',{name:'Confirm connections'}))
 expect(apply.mock.calls[0][0].connections[0]).toMatchObject({portKey:'door:door',disconnect:true})
})
