import { describe, expect, it, vi } from 'vitest'
import type { CampusDocument, Wall } from '@navi/core'
import { DoorTool } from '../door-tool'
import type { ToolContext, ToolPointerEvent } from '../types'
const wall=(patch:Partial<Wall>={}):Wall=>({id:'w',start:{x:0,y:0},end:{x:10,y:0},height:3.5,thickness:.15,...patch})
function event(x:number,y:number):ToolPointerEvent{return {x,y,lng:x,lat:y,button:0,shiftKey:false,ctrlKey:false,altKey:false}}
function context(walls:Wall[]=[wall()]):ToolContext {
 return {document:{buildings:[{id:'b',floors:[{id:'f',level:0,walls}]}]} as CampusDocument,services:{dispatcher:{execute:vi.fn(()=>({success:true}))},viewport:{activeBuildingId:'b',activeFloorId:'f'}} as unknown as ToolContext['services']}
}
describe('DoorTool wall-bound rectangle authoring',()=>{
 it('previews a snapped rectangle and commits once on release',()=>{
  const ctx=context(),tool=new DoorTool();tool.onPointerDown(event(2,.1),ctx);tool.onPointerMove(event(4,.4),ctx)
  expect(tool.state.phase).toBe('dragging');expect(ctx.services.dispatcher.execute).not.toHaveBeenCalled()
  tool.preview?.forEach((point,index)=>expect(point.y).toBeCloseTo(index<2?-.15:.15))
  tool.onPointerUp(event(4,.4),ctx)
  expect(ctx.services.dispatcher.execute).toHaveBeenCalledOnce()
  expect(vi.mocked(ctx.services.dispatcher.execute).mock.calls[0][0]).toMatchObject({id:'door.create',payload:{buildingId:'b',floorId:'f',door:{position:{x:3,y:0},width:2,rotation:0,wallAttachment:{wallId:'w',offset:3,openingHeight:2.1}}}})
  expect(vi.mocked(ctx.services.dispatcher.execute).mock.calls[0][0].payload.door.depth).toBeCloseTo(.3)
 })
 it('rejects a missing host instead of creating a free rectangle',()=>{
  const ctx=context([]),tool=new DoorTool();tool.onPointerDown(event(2,3),ctx);tool.onPointerUp(event(5,6),ctx)
  expect(ctx.services.dispatcher.execute).not.toHaveBeenCalled();expect(tool.message).toMatch(/wall/i)
 })
 it('freezes the chosen host even when the pointer approaches another wall',()=>{
  const ctx=context([wall(),wall({id:'other',start:{x:0,y:3},end:{x:10,y:3}})]),tool=new DoorTool()
  tool.onPointerDown(event(2,.1),ctx);tool.onPointerUp(event(5,2.9),ctx)
  expect(vi.mocked(ctx.services.dispatcher.execute).mock.calls[0][0]).toMatchObject({payload:{door:{wallAttachment:{wallId:'w'},position:{x:3.5,y:0}}}})
 })
 it('cancels on Escape and on changing active floor',()=>{
  const ctx=context(),tool=new DoorTool();tool.onPointerDown(event(2,0),ctx);tool.onKeyDown({key:'Escape'} as KeyboardEvent,ctx);tool.onPointerUp(event(4,0),ctx)
  expect(ctx.services.dispatcher.execute).not.toHaveBeenCalled()
  tool.onPointerDown(event(2,0),ctx);ctx.services.viewport!.activeFloorId='other';tool.onPointerUp(event(4,0),ctx)
  expect(ctx.services.dispatcher.execute).not.toHaveBeenCalled()
 })
 it('preserves useful feedback after a refused command',()=>{
  const ctx=context(),tool=new DoorTool();vi.mocked(ctx.services.dispatcher.execute).mockReturnValue({success:false,error:'Floor is locked'})
  tool.onPointerDown(event(2,0),ctx);tool.onPointerUp(event(4,0),ctx)
  expect(tool.message).toContain('Floor is locked')
 })
})
