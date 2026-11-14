import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { doorCreateHandler, doorUpdateHandler, doorDeleteHandler, openingCreateHandler, openingUpdateHandler } from '../feature-handlers'
function fixture():CampusDocument{return {schemaVersion:1,version:0,metadata:{campusId:'c',name:'c',description:'',lastModified:'',editorVersion:''},roads:[],panoramas:[],qrCheckpoints:[],buildings:[{id:'b',name:'B',floors:[{id:'f',level:0,height:3.5,elevation:0,label:'GF',rooms:[{id:'owner',name:'Owner',roomDoors:[],polygon:{points:[]}}],roomAttributes:[],hallways:[],entrances:[],staircases:[],elevators:[],connectorStops:[],metadata:{},walls:[{id:'w',start:{x:0,y:0},end:{x:10,y:0},height:3.5,thickness:0.2}],doors:[]}]}]} as CampusDocument}
const create={buildingId:'b',floorId:'f',roomId:'owner',door:{id:'d',position:{x:3,y:0},width:1,depth:0.2,wallAttachment:{wallId:'w',offset:3,openingHeight:2.1}}}
describe('attached door commands',()=>{
 it('undoes cosmetic pose on an imported unresolved host without forward repair',()=>{
  const doc=fixture();doorCreateHandler.execute(doc,create);const floor=doc.buildings[0].floors[0]
  floor.doors![0].wallAttachment!.wallId='missing-host';const before=structuredClone(floor.doors![0])
  const payload={doorId:'d',patch:{doorPose:'open'}};const result=doorUpdateHandler.execute(doc,payload);expect(result.success).toBe(true)
  expect(doorUpdateHandler.execute(doc,doorUpdateHandler.inverse!(payload,result)!.payload).success).toBe(true);expect(floor.doors![0]).toEqual(before)
 })
 it('undoes deletion with stale imported ownership without changing the snapshot',()=>{
  const doc=fixture();doorCreateHandler.execute(doc,create);const floor=doc.buildings[0].floors[0]
  floor.doors![0].roomId='missing-owner';const before=structuredClone(floor.doors![0]),payload={doorId:'d'}
  const result=doorDeleteHandler.execute(doc,payload);expect(result.success).toBe(true)
  expect(doorCreateHandler.execute(doc,doorDeleteHandler.inverse!(payload,result)!.payload).success).toBe(true);expect(floor.doors![0]).toEqual(before)
 })
 it('changes pose and double style without normalizing legacy geometry or links, then undoes absence exactly',()=>{
  const doc=fixture();doorCreateHandler.execute(doc,create);const floor=doc.buildings[0].floors[0]
  floor.doors![0].position={x:1,y:2};delete floor.doors![0].geometry;const before=structuredClone(floor.doors![0]),network=structuredClone(floor.routeNetwork)
  const payload={doorId:'d',patch:{doorPose:'open',doorAppearance:'double-glass'}};const result=doorUpdateHandler.execute(doc,payload)
  expect(result.success).toBe(true);expect(floor.doors![0]).toEqual({...before,...payload.patch});expect(floor.routeNetwork).toEqual(network)
  expect(doorUpdateHandler.execute(doc,doorUpdateHandler.inverse!(payload,result)!.payload).success).toBe(true);expect(floor.doors![0]).toEqual(before)
 })
 it.each([null,42,'sideways'])('refuses an invalid door pose %s before mutation',doorPose=>{
  const doc=fixture(),before=JSON.stringify(doc);expect(doorCreateHandler.execute(doc,{...create,door:{...create.door,doorPose}}).success).toBe(false);expect(JSON.stringify(doc)).toBe(before)
  doorCreateHandler.execute(doc,create);const snapshot=JSON.stringify(doc);expect(doorUpdateHandler.execute(doc,{doorId:'d',patch:{doorPose}}).success).toBe(false);expect(JSON.stringify(doc)).toBe(snapshot)
 })
 it('keeps appearance-only changes independent of legacy physical and routing normalization',()=>{
  const doc=fixture();doorCreateHandler.execute(doc,create);const floor=doc.buildings[0].floors[0],door=floor.doors![0]
  door.position={x:2,y:1};delete door.geometry;delete door.depth;delete door.rotation
  door.routeConnection={anchorNodeId:'anchor',targetRouteNodeId:'target',connectorEdgeId:'edge'}
  floor.routeNetwork={nodes:[{id:'anchor',type:'portal',position:{x:2,y:1},floor:0},{id:'target',type:'waypoint',position:{x:3,y:3},floor:0}],edges:[{id:'edge',from:'anchor',to:'target',distance:2.3,type:'walk'}]}
  const before=structuredClone(door),network=structuredClone(floor.routeNetwork),payload={doorId:'d',patch:{doorAppearance:'glass'}}
  const result=doorUpdateHandler.execute(doc,payload);expect(result.success).toBe(true)
  expect(floor.doors![0]).toEqual({...before,doorAppearance:'glass'});expect(floor.routeNetwork).toEqual(network)
  expect(doorUpdateHandler.execute(doc,doorUpdateHandler.inverse!(payload,result)!.payload).success).toBe(true)
  expect(floor.doors![0]).toEqual(before);expect(floor.routeNetwork).toEqual(network)
 })
 it('retains explicit door appearance and restores absent legacy style on undo',()=>{
  const doc=fixture();doorCreateHandler.execute(doc,create)
  const before=structuredClone(doc.buildings[0].floors[0].doors![0])
  const payload={doorId:'d',patch:{doorAppearance:'glass'}}
  const result=doorUpdateHandler.execute(doc,payload)
  expect(result.success).toBe(true);expect(doc.buildings[0].floors[0].doors![0]).toMatchObject({doorAppearance:'glass'})
  expect(doorUpdateHandler.execute(doc,doorUpdateHandler.inverse!(payload,result)!.payload).success).toBe(true)
  expect(doc.buildings[0].floors[0].doors![0]).toEqual(before)
  const other=fixture();expect(doorCreateHandler.execute(other,{...create,door:{...create.door,doorAppearance:'glass'}}).success).toBe(true)
  expect(other.buildings[0].floors[0].doors![0]).toMatchObject({doorAppearance:'glass'})
 })
 it.each(['unknown',null,42])('refuses invalid door appearance %s atomically',doorAppearance=>{
  const doc=fixture(),before=JSON.stringify(doc)
  expect(doorCreateHandler.execute(doc,{...create,door:{...create.door,doorAppearance}}).success).toBe(false)
  expect(JSON.stringify(doc)).toBe(before)
  doorCreateHandler.execute(doc,create);const saved=JSON.stringify(doc)
  expect(doorUpdateHandler.execute(doc,{doorId:'d',patch:{doorAppearance}}).success).toBe(false)
  expect(JSON.stringify(doc)).toBe(saved)
 })
 it.each([NaN,Infinity,0,-1])('refuses invalid resized depth %s without changing attachment or routes',depth=>{
  const doc=fixture();doorCreateHandler.execute(doc,create);const before=JSON.stringify(doc)
  expect(doorUpdateHandler.execute(doc,{doorId:'d',patch:{depth}}).success).toBe(false)
  expect(JSON.stringify(doc)).toBe(before)
 })
 it('resizes width and depth while retaining owner, center, route assignment, and exact undo',()=>{
  const doc=fixture();doorCreateHandler.execute(doc,create);const floor=doc.buildings[0].floors[0]
  floor.doors![0].routeConnection={anchorNodeId:'anchor',targetRouteNodeId:'target',connectorEdgeId:'edge'}
  floor.routeNetwork={nodes:[{id:'anchor',type:'portal',position:{x:3,y:0},floor:0},{id:'target',type:'waypoint',position:{x:3,y:3},floor:0}],edges:[{id:'edge',from:'anchor',to:'target',distance:3,type:'walk'}]}
  const before=structuredClone(floor),payload={doorId:'d',patch:{width:2,depth:.6}}
  const result=doorUpdateHandler.execute(doc,payload)
  expect(result.success).toBe(true);expect(floor.doors![0]).toMatchObject({roomId:'owner',width:2,depth:.6,position:{x:3,y:0},wallAttachment:create.door.wallAttachment,routeConnection:before.doors![0].routeConnection})
  expect(floor.routeNetwork).toEqual(before.routeNetwork)
  expect(doorUpdateHandler.execute(doc,doorUpdateHandler.inverse!(payload,result)!.payload).success).toBe(true)
  expect(floor).toEqual(before)
 })
 it('stores canonical attachment and derives its position and orientation',()=>{const doc=fixture();const result=doorCreateHandler.execute(doc,{...create,door:{...create.door,position:{x:99,y:99}}});expect(result.success).toBe(true);expect(doc.buildings[0].floors[0].doors![0]).toMatchObject({wallAttachment:create.door.wallAttachment,position:{x:3,y:0},rotation:0})})
 it('refuses overlap and invalid host without changing document',()=>{const doc=fixture();doorCreateHandler.execute(doc,create);const before=JSON.stringify(doc);expect(doorCreateHandler.execute(doc,{...create,door:{...create.door,id:'d2'}}).success).toBe(false);expect(JSON.stringify(doc)).toBe(before);expect(doorCreateHandler.execute(doc,{...create,door:{...create.door,id:'d3',wallAttachment:{wallId:'missing',offset:3,openingHeight:2.1}}}).success).toBe(false);expect(JSON.stringify(doc)).toBe(before)})
 it('rejects invalid owning room before applying another property',()=>{const doc=fixture();doorCreateHandler.execute(doc,create);const before=JSON.stringify(doc);expect(doorUpdateHandler.execute(doc,{doorId:'d',patch:{position:{x:4,y:0},roomId:'missing'}}).success).toBe(false);expect(JSON.stringify(doc)).toBe(before)})
 it('slides attached doors along the host and preserves explicit ownership',()=>{const doc=fixture();doorCreateHandler.execute(doc,create);const result=doorUpdateHandler.execute(doc,{doorId:'d',patch:{position:{x:4,y:2}}});expect(result.success).toBe(true);expect(doc.buildings[0].floors[0].doors![0]).toMatchObject({roomId:'owner',position:{x:4,y:0},wallAttachment:{offset:4}})})
 it('undoes first attachment back to an absent field',()=>{const doc=fixture();doorCreateHandler.execute(doc,{...create,door:{id:'d',position:{x:3,y:0},width:1}});const payload={doorId:'d',patch:{wallAttachment:create.door.wallAttachment}};const result=doorUpdateHandler.execute(doc,payload);expect(result.success).toBe(true);const inverse=doorUpdateHandler.inverse!(payload,result)!;expect(doorUpdateHandler.execute(doc,inverse.payload).success).toBe(true);expect('wallAttachment'in doc.buildings[0].floors[0].doors![0]).toBe(false)})
})
describe('canonical opening properties',()=>{
 const base={buildingId:'b',floorId:'f',opening:{id:'win',type:'window',wallId:'w',offset:3,width:1.2,height:1.2,sillHeight:0.9}}
 it.each([{width:NaN},{height:Infinity},{offset:9.9},{sillHeight:3},{wallId:'missing'}])('rejects invalid window %j without mutation',patch=>{const doc=fixture(),before=JSON.stringify(doc);expect(openingCreateHandler.execute(doc,{...base,opening:{...base.opening,...patch}}).success).toBe(false);expect(JSON.stringify(doc)).toBe(before)})
 it('rejects overlap with an attached door',()=>{const doc=fixture();doorCreateHandler.execute(doc,create);expect(openingCreateHandler.execute(doc,base).success).toBe(false)})
 it('updates window dimensions and restores exact absent fields on undo',()=>{const doc=fixture();expect(openingCreateHandler.execute(doc,{...base,opening:{id:'win',type:'window',wallId:'w',offset:3,width:1.2}}).success).toBe(true);const payload={openingId:'win',patch:{height:1,sillHeight:1}};const result=openingUpdateHandler.execute(doc,payload);expect(result.success).toBe(true);const inverse=openingUpdateHandler.inverse!(payload,result)!;expect(openingUpdateHandler.execute(doc,inverse.payload).success).toBe(true);const win=doc.buildings[0].floors[0].openings![0];expect('height'in win).toBe(false);expect('sillHeight'in win).toBe(false)})
})

it('undo restores pre-existing attached door geometry absence exactly',()=>{const doc=fixture(),floor=doc.buildings[0].floors[0];doorCreateHandler.execute(doc,create);delete floor.doors![0].geometry;delete floor.doors![0].rotation;const before=structuredClone(floor.doors![0]);const payload={doorId:'d',patch:{wallAttachment:{wallId:'w',offset:4,openingHeight:2.1}}};const result=doorUpdateHandler.execute(doc,payload);expect(result.success).toBe(true);const inverse=doorUpdateHandler.inverse!(payload,result)!;expect(doorUpdateHandler.execute(doc,inverse.payload).success).toBe(true);expect(floor.doors![0]).toEqual(before)})

it('undo delete preserves the explicit door wall attachment',()=>{const doc=fixture();doorCreateHandler.execute(doc,create);const payload={doorId:'d'};const result=doorDeleteHandler.execute(doc,payload);const inverse=doorDeleteHandler.inverse!(payload,result)!;expect(doorCreateHandler.execute(doc,inverse.payload).success).toBe(true);expect(doc.buildings[0].floors[0].doors![0].wallAttachment).toEqual(create.door.wallAttachment)})

describe('repairing invalid existing canonical openings',()=>{
 it.each([
   {height:2,sillHeight:1,offset:6,width:1},
   {height:1,sillHeight:1,offset:9.5,width:1},
   {height:1,sillHeight:1,offset:3,width:1},
 ])('undo restores the exact pre-repair snapshot %j',invalid=>{
   const doc=fixture(),floor=doc.buildings[0].floors[0]
   floor.walls![0].height=2.5
   doorCreateHandler.execute(doc,create)
   floor.openings=[{id:'legacy-window',type:'window',wallId:'w',...invalid,metadata:{source:'imported'}}]
   const before=structuredClone(floor.openings[0])
   const payload={openingId:'legacy-window',patch:{height:1,sillHeight:1,offset:6,width:1}}
   const result=openingUpdateHandler.execute(doc,payload)
   expect(result.success).toBe(true)
   const inverse=openingUpdateHandler.inverse!(payload,result)!
   expect(openingUpdateHandler.execute(doc,inverse.payload).success).toBe(true)
   expect(floor.openings![0]).toEqual(before)
   const restored=JSON.stringify(doc)
   expect(openingUpdateHandler.execute(doc,{openingId:'legacy-window',patch:{height:5}}).success).toBe(false)
   expect(JSON.stringify(doc)).toBe(restored)
 })
})
