import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { useFloorDrawing } from '../useFloorDrawing'
// World (lng/lat) and building-local metres deliberately differ, so a raw lng/lat position is caught.
const h=vi.hoisted(()=>({doc:null as unknown as CampusDocument,execute:vi.fn()}))
vi.mock('@navi/editor',()=>({
 useEditor:()=>({document:h.doc,transformer:{worldToBuildingLocal:(p:{lng:number;lat:number})=>({x:(p.lng-121)*1000,y:(p.lat-11)*1000}),buildingLocalToWorld:(p:{x:number;y:number})=>({lng:121+p.x/1000,lat:11+p.y/1000})},services:{get:()=>({execute:h.execute})}}),
 findBuilding:(doc:CampusDocument,id:string)=>doc.buildings.find(b=>b.id===id),genId:(kind:string)=>kind+'-generated',snapPoint:(position:unknown)=>({position}),
}))
function probe(){
 const handlers=new Map<string,Set<(e:unknown)=>void>>(),source={setData:vi.fn()};let added=false
 const map={isStyleLoaded:()=>true,getSource:()=>added?source:undefined,addSource:()=>{added=true},addLayer:vi.fn(),getLayer:()=>undefined,queryRenderedFeatures:()=>[],once:vi.fn(),on:(name:string,cb:(e:unknown)=>void)=>{const list=handlers.get(name)??new Set();list.add(cb);handlers.set(name,list)},off:(name:string,cb:(e:unknown)=>void)=>handlers.get(name)?.delete(cb),dragPan:{disable:vi.fn(),enable:vi.fn()}}
 return {map:map as unknown as import('maplibre-gl').Map,click:(lng:number,lat:number)=>{for(const cb of [...handlers.get('click')??[]])cb({lngLat:{lng,lat},point:{x:0,y:0},originalEvent:{button:0,detail:1,preventDefault:vi.fn()}})}}
}
beforeEach(()=>{h.execute.mockReset().mockReturnValue({success:true});h.doc={buildings:[{id:'b',floors:[{id:'f',level:0,walls:[],rooms:[],doors:[],entrances:[]}]}],roads:[],panoramas:[],qrCheckpoints:[]} as unknown as CampusDocument})
afterEach(cleanup)
it('Entry Point stores the click in building-local metres, not latitude/longitude',()=>{
 const p=probe()
 renderHook(()=>useFloorDrawing({map:p.map,mapReady:true,buildingId:'b',campusId:'c',floor:0,tool:'entrance' as never,onSelect:vi.fn()}))
 act(()=>p.click(121.004,11.002))
 const call=h.execute.mock.calls.find(c=>c[0].id==='entrance.create')
 expect(call,'entrance.create was dispatched').toBeTruthy()
 const position=call![0].payload.position
 expect(position.x).toBeCloseTo(4,6);expect(position.y).toBeCloseTo(2,6)
 expect(position).not.toHaveProperty('lat')
})
