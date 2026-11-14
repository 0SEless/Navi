import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampusDocument, Wall } from '@navi/core'
import type { StudioTool } from '@/types/studio-types'
import { useFloorDrawing } from '../useFloorDrawing'
const h=vi.hoisted(()=>({doc:null as unknown as CampusDocument,execute:vi.fn()}))
vi.mock('@navi/editor',()=>({
 useEditor:()=>({document:h.doc,transformer:{worldToBuildingLocal:(p:{lng:number;lat:number})=>({x:p.lng,y:p.lat}),buildingLocalToWorld:(p:{x:number;y:number})=>({lng:p.x,lat:p.y})},services:{get:()=>({execute:h.execute})}}),
 findBuilding:(doc:CampusDocument,id:string)=>doc.buildings.find(b=>b.id===id),genId:(kind:string)=>kind+'-generated',snapPoint:(position:unknown)=>({position}),
}))
const wall=(patch:Partial<Wall>={}):Wall=>({id:'w',start:{x:0,y:0},end:{x:10,y:0},height:3.5,thickness:.15,...patch})
function probe(){
 const handlers=new Map<string,Set<(e:unknown)=>void>>(),source={setData:vi.fn()};let added=false
 const map={isStyleLoaded:()=>true,getSource:()=>added?source:undefined,addSource:()=>{added=true},addLayer:vi.fn(),getLayer:()=>undefined,queryRenderedFeatures:()=>[],once:vi.fn(),on:(name:string,cb:(e:unknown)=>void)=>{const list=handlers.get(name)??new Set();list.add(cb);handlers.set(name,list)},off:(name:string,cb:(e:unknown)=>void)=>handlers.get(name)?.delete(cb),dragPan:{disable:vi.fn(),enable:vi.fn()}}
 return {map:map as unknown as import('maplibre-gl').Map,source,fire:(name:string,x:number,y:number)=>{for(const cb of [...handlers.get(name)??[]])cb({lngLat:{lng:x,lat:y},point:{x,y},originalEvent:{button:0,detail:1,preventDefault:vi.fn()}})}}
}
function setup(tool:StudioTool='door',readOnly=false){
 const p=probe(),onSelect=vi.fn()
 const hook=renderHook(({floor,tool,readOnly}:{floor:number;tool:StudioTool;readOnly?:boolean})=>useFloorDrawing({map:p.map,mapReady:true,buildingId:'b',campusId:'c',floor,tool,readOnly,onSelect}),{initialProps:{floor:0,tool,readOnly}})
 return {...p,...hook,onSelect}
}
beforeEach(()=>{h.execute.mockReset().mockReturnValue({success:true});h.doc={buildings:[{id:'b',floors:[{id:'f',level:0,walls:[wall()],rooms:[],doors:[]},{id:'f1',level:1,walls:[],rooms:[],doors:[]}]}],roads:[],panoramas:[],qrCheckpoints:[]} as unknown as CampusDocument})
afterEach(cleanup)
describe('production floor door and window wall authoring',()=>{
 it('lets the placement drag size both width and depth while keeping the door center on the host',()=>{
  const p=setup();act(()=>p.fire('mousedown',2,0));act(()=>p.fire('mousemove',4,.8));act(()=>p.fire('mouseup',4,.8))
  expect(h.execute).toHaveBeenCalledOnce();expect(h.execute.mock.calls[0][0]).toMatchObject({id:'door.create',payload:{door:{position:{x:3,y:0},width:2,depth:.8,wallAttachment:{wallId:'w',offset:3}}}})
 })
 it('refuses door and window authoring while read-only',()=>{
  const door=setup('door',true);act(()=>door.fire('mousedown',2,0));act(()=>door.fire('mousemove',4,0));act(()=>door.fire('mouseup',4,0));door.unmount()
  const window=setup('window',true);act(()=>window.fire('click',2,0));act(()=>window.fire('click',4,0))
  expect(h.execute).not.toHaveBeenCalled();expect(window.onSelect).not.toHaveBeenCalled()
 })
 it('discards door and window drafts when editing becomes read-only',()=>{
  const door=setup();act(()=>door.fire('mousedown',2,0));door.rerender({floor:0,tool:'door',readOnly:true});act(()=>door.fire('mouseup',4,0));door.rerender({floor:0,tool:'door',readOnly:false});act(()=>door.fire('mouseup',4,0));door.unmount()
  const window=setup('window');act(()=>window.fire('click',2,0));window.rerender({floor:0,tool:'window',readOnly:true});act(()=>window.fire('click',4,0));window.rerender({floor:0,tool:'window',readOnly:false});act(()=>window.fire('click',4,0))
  expect(h.execute).not.toHaveBeenCalled();expect(window.onSelect).not.toHaveBeenCalled()
 })
 it('authors a centered attached door even when the drag has no perpendicular depth',()=>{
  const p=setup();act(()=>p.fire('mousedown',2,.1));act(()=>p.fire('mousemove',4,.1));act(()=>p.fire('mouseup',4,.1))
  expect(h.execute).toHaveBeenCalledOnce();expect(h.execute.mock.calls[0][0]).toMatchObject({id:'door.create',payload:{floorId:'f',door:{position:{x:3,y:0},width:2,depth:.15,wallAttachment:{wallId:'w',offset:3}}}})
 })
 it('previews the same diagonal geometry that it commits',()=>{
  h.doc.buildings[0].floors[0].walls=[wall({end:{x:10,y:10}})]
  const p=setup();act(()=>p.fire('mousedown',2,2));act(()=>p.fire('mousemove',4,4))
  const data=p.source.setData.mock.calls.at(-1)?.[0] as GeoJSON.FeatureCollection
  expect(data.features.some(f=>f.geometry.type==='Polygon')).toBe(true)
  act(()=>p.fire('mouseup',4,4));expect(h.execute.mock.calls[0][0].payload.door.rotation).toBeCloseTo(Math.PI/4)
 })
 it('rejects ambiguous hosts and cannot create after changing floors',()=>{
  h.doc.buildings[0].floors[0].walls!.push(wall({id:'other',end:{x:0,y:10}}))
  const p=setup();act(()=>p.fire('mousedown',.1,.1));act(()=>p.fire('mouseup',3,3));expect(h.execute).not.toHaveBeenCalled()
  act(()=>p.fire('mousedown',2,0));p.rerender({floor:1,tool:'door'});act(()=>p.fire('mouseup',4,0));expect(h.execute).not.toHaveBeenCalled()
 })
 it('keeps the frozen wall and does not select a room underneath the drawing',()=>{
  h.doc.buildings[0].floors[0].walls!.push(wall({id:'other',start:{x:0,y:3},end:{x:10,y:3}}))
  const p=setup();act(()=>p.fire('mousedown',2,0));act(()=>p.fire('mouseup',4,3))
  expect(h.execute.mock.calls[0][0]).toMatchObject({payload:{door:{position:{x:3,y:0},wallAttachment:{wallId:'w'}}}})
  expect(p.onSelect).toHaveBeenCalledWith('door-generated')
 })
 it('cancels a door draft without executing or selecting',()=>{
  const p=setup();act(()=>p.fire('mousedown',2,0));act(()=>p.result.current.cancel());act(()=>p.fire('mouseup',4,0))
  expect(h.execute).not.toHaveBeenCalled();expect(p.onSelect).not.toHaveBeenCalled()
 })
 it('creates a canonical window with explicit vertical dimensions',()=>{
  const p=setup('window');act(()=>p.fire('click',2,.1));act(()=>p.fire('click',4,.2))
  expect(h.execute).toHaveBeenCalledOnce();expect(h.execute.mock.calls[0][0]).toMatchObject({id:'opening.create',payload:{opening:{type:'window',wallId:'w',offset:2,width:2,height:1.2,sillHeight:.9}}})
 })
 it('retains the first window point and exposes the actual command error for correction',()=>{
  h.execute.mockReturnValue({success:false,error:'Window overlaps door-1'})
  const p=setup('window');act(()=>p.fire('click',2,.1));act(()=>p.fire('click',4,.1))
  expect(p.onSelect).not.toHaveBeenCalled();expect(p.result.current.rectangleMessage).toContain('Window overlaps door-1')
  h.execute.mockReturnValue({success:true});act(()=>p.fire('click',5,.1))
  expect(h.execute.mock.calls.at(-1)?.[0].payload.opening).toMatchObject({offset:2,width:3})
 })
 it('projects the second window click onto the original host even if another is nearer',()=>{
  h.doc.buildings[0].floors[0].walls!.push(wall({id:'other',start:{x:0,y:.4},end:{x:10,y:.4}}))
  const p=setup('window');act(()=>p.fire('click',2,0));act(()=>p.fire('click',4,.35))
  expect(h.execute.mock.calls[0][0].payload.opening.wallId).toBe('w')
 })
})
