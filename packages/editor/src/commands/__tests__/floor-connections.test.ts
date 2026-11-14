import {doorDeleteHandler,doorCreateHandler} from '../feature-handlers'
import {entranceDeleteHandler} from '../entrance-handlers'
import {CommandRegistry} from '../registry'
import {CommandDispatcher} from '../dispatcher'
import {HistoryStack} from '../../history'
import {DocumentEventBus} from '../../eventbus'
import {DocumentStore} from '../../context/document-store'
import {routePathCreateHandler} from '../route-network-handlers'
import {entityUpdateHandler} from '../entity-update-handler'
import {doorUpdateHandler} from '../feature-handlers'
import {routeNodeUpdateHandler} from '../route-network-handlers'
import {featureUpdateHandler,featureDeleteHandler} from '../feature-handlers'
import {featureLevelCopyHandler,featureLevelUpdateHandler} from '../levels-handlers'
import {expect,it} from 'vitest'
import {routeNodeDeleteHandler} from '../route-network-handlers'
import {floorConnectionsApplyHandler} from '../floor-route-workflow'
import {suggestFloorConnections,floorConnectionSignature} from '../../geometry/floor-connections'
const fixture=()=>{const floor:any={id:'f',level:0,entrances:[{id:'e',name:'Entrance',position:{x:8,y:0}}],doors:[{id:'d',name:'Door',width:1,depth:.2,doorType:'standard',position:{x:2,y:0},wallAttachment:{wallId:'wall',offset:2,openingHeight:2.1},metadata:{}}],walls:[{id:'wall',start:{x:0,y:0},end:{x:10,y:0},height:3,thickness:.2}],openings:[],routeNetwork:{nodes:[{id:'a',type:'waypoint',position:{x:0,y:3},floor:0},{id:'b',type:'waypoint',position:{x:10,y:3},floor:0}],edges:[{id:'spine',from:'a',to:'b',type:'walk',distance:10}]}};const building:any={id:'b',floors:[floor],staircases:[{id:'s',name:'Stair',levels:{0:{position:{x:4,y:1},rotation:0}}}],elevators:[{id:'lift',name:'Lift',levels:{0:{position:{x:6,y:1},rotation:0}}}]};return {floor,building,doc:{schemaVersion:1,version:0,metadata:{campusId:'c'},roads:[],buildings:[building]} as any}}

it('applies all feature kinds onto the same original segment atomically, with exact one-step undo',()=>{
 const {doc,floor,building}=fixture(),before=structuredClone(doc.buildings),payload={buildingId:'b',floorId:'f',expectedSignature:floorConnectionSignature(building,floor),connections:suggestFloorConnections(building,floor).filter(r=>r.accepted)}
 const result=floorConnectionsApplyHandler.execute(doc,payload);expect(result.success,result.error).toBe(true)
 expect(floor.doors[0].routeConnection).toBeTruthy();expect(floor.entrances[0].routeConnection).toBeTruthy()
 expect(building.staircases[0].levels[0].routeConnection).toBeTruthy();expect(building.elevators[0].levels[0].routeConnection).toBeTruthy()
 const ids=new Set(floor.routeNetwork.nodes.map((n:any)=>n.id));expect(floor.routeNetwork.edges.every((e:any)=>ids.has(e.from)&&ids.has(e.to))).toBe(true)
 const undo=floorConnectionsApplyHandler.inverse!(payload,result)!;expect(floorConnectionsApplyHandler.execute(doc,undo.payload).success).toBe(true);expect(doc.buildings).toEqual(before)
})
it('rejects stale or blocked corrections without partial graph mutations',()=>{
 const {doc,floor,building}=fixture(),rows=suggestFloorConnections(building,floor),signature=floorConnectionSignature(building,floor)
 floor.walls.push({id:'barrier',start:{x:0,y:2},end:{x:10,y:2},height:3,thickness:.2});const before=JSON.stringify(doc)
 expect(floorConnectionsApplyHandler.execute(doc,{buildingId:'b',floorId:'f',expectedSignature:signature,connections:rows}).success).toBe(false);expect(JSON.stringify(doc)).toBe(before)
 expect(floorConnectionsApplyHandler.execute(doc,{buildingId:'b',floorId:'f',connections:rows}).success).toBe(false);expect(JSON.stringify(doc)).toBe(before)
})
it('permits reconnecting and disconnecting a confirmed feature without deleting its other branches',()=>{
 const {doc,floor,building}=fixture();const first=suggestFloorConnections(building,floor).find(r=>r.portKey==='stair:s')!
 expect(floorConnectionsApplyHandler.execute(doc,{buildingId:'b',floorId:'f',connections:[first]}).success).toBe(true)
 const geom=building.staircases[0].levels[0],anchor=geom.routeConnection.anchorNodeId
 floor.routeNetwork.nodes.push({id:'branch',type:'waypoint',position:{x:4,y:-1},floor:0});floor.routeNetwork.edges.push({id:'manual',from:anchor,to:'branch',type:'walk',distance:2})
 expect(floorConnectionsApplyHandler.execute(doc,{buildingId:'b',floorId:'f',connections:[{portKey:'stair:s',disconnect:true}]}).success).toBe(true)
 expect(geom.routeConnection).toBeUndefined();expect(floor.routeNetwork.edges.some((e:any)=>e.id==='manual')).toBe(true);expect(floor.routeNetwork.nodes.some((n:any)=>n.id===anchor)).toBe(true)
})

it('cleans explicit route-port references on node deletion and restores them exactly on undo',()=>{
 const {doc,floor,building}=fixture();floorConnectionsApplyHandler.execute(doc,{buildingId:'b',floorId:'f',connections:suggestFloorConnections(building,floor).filter(r=>r.accepted)})
 const target=building.staircases[0].levels[0].routeConnection.targetRouteNodeId,before=structuredClone(doc.buildings)
 const payload={nodeId:target,confirmed:true};const result=routeNodeDeleteHandler.execute(doc,payload);expect(result.success).toBe(true)
 expect(building.staircases[0].levels[0].routeConnection).toBeUndefined()
 const undo=routeNodeDeleteHandler.inverse!(payload,result)!;routeNodeDeleteHandler.execute(doc,undo.payload);expect(doc.buildings).toEqual(before)
})

it('moves a feature access point with the feature and restores route coordinates on undo',()=>{
 const {doc,floor,building}=fixture();floorConnectionsApplyHandler.execute(doc,{buildingId:'b',floorId:'f',connections:[suggestFloorConnections(building,floor).find(r=>r.portKey==='stair:s')]})
 const before=structuredClone(doc.buildings),payload={featureId:'s',level:0,patch:{position:{x:5,y:1}}},result=featureUpdateHandler.execute(doc,payload)
 expect(result.success).toBe(true);const conn=building.staircases[0].levels[0].routeConnection
 expect(floor.routeNetwork.nodes.find((n:any)=>n.id===conn.anchorNodeId).position).toEqual({x:5,y:1})
 const undo=featureUpdateHandler.inverse!(payload,result)!;featureUpdateHandler.execute(doc,undo.payload);expect(doc.buildings).toEqual(before)
})
it('copies placement to another floor without copying route identities, and removes owned stubs on feature deletion',()=>{
 const {doc,floor,building}=fixture();floorConnectionsApplyHandler.execute(doc,{buildingId:'b',floorId:'f',connections:[suggestFloorConnections(building,floor).find(r=>r.portKey==='stair:s')]})
 const conn=structuredClone(building.staircases[0].levels[0].routeConnection)
 building.floors.push({id:'f1',level:1,entrances:[],rooms:[],doors:[],walls:[]})
 expect(featureLevelCopyHandler.execute(doc,{featureId:'s',featureType:'staircase',fromFloor:0,toFloor:1}).success).toBe(true)
 expect(building.staircases[0].levels[1].routeConnection).toBeUndefined()
 expect(featureDeleteHandler.execute(doc,{featureId:'s'}).success).toBe(true)
 expect(floor.routeNetwork.edges.some((e:any)=>e.id===conn.connectorEdgeId)).toBe(false);expect(floor.routeNetwork.nodes.some((n:any)=>n.id===conn.anchorNodeId)).toBe(false)
})

it('keeps level-update access synchronized and restores the exact level and graph on undo',()=>{
 const {doc,floor,building}=fixture();floorConnectionsApplyHandler.execute(doc,{buildingId:'b',floorId:'f',connections:[suggestFloorConnections(building,floor).find(r=>r.portKey==='stair:s')]})
 const before=structuredClone(doc.buildings),payload={featureId:'s',featureType:'staircase',floor:0,patch:{position:{x:5,y:1},rotation:25}}
 const result=featureLevelUpdateHandler.execute(doc,payload);expect(result.success,result.error).toBe(true)
 const anchor=building.staircases[0].levels[0].routeConnection.anchorNodeId
 expect(floor.routeNetwork.nodes.find((n:any)=>n.id===anchor).position).toEqual({x:5,y:1})
 const undo=featureLevelUpdateHandler.inverse!(payload,result)!;featureLevelUpdateHandler.execute(doc,undo.payload);expect(doc.buildings).toEqual(before)
})
it('restores a connected target graph after copying a different floor placement and undoing',()=>{
 const {doc,floor,building}=fixture();floorConnectionsApplyHandler.execute(doc,{buildingId:'b',floorId:'f',connections:[suggestFloorConnections(building,floor).find(r=>r.portKey==='stair:s')]})
 building.staircases[0].levels[1]={position:{x:7,y:1},rotation:15}
 const before=structuredClone(doc.buildings),payload={featureId:'s',featureType:'staircase',fromFloor:1,toFloor:0}
 const result=featureLevelCopyHandler.execute(doc,payload);expect(result.success,result.error).toBe(true)
 const anchor=building.staircases[0].levels[0].routeConnection.anchorNodeId
 expect(floor.routeNetwork.nodes.find((n:any)=>n.id===anchor).position).toEqual({x:7,y:1})
 const undo=featureLevelCopyHandler.inverse!(payload,result)!;featureLevelCopyHandler.execute(doc,undo.payload);expect(doc.buildings).toEqual(before)
})

it('moves an entrance terminal with its owner and restores it on undo',()=>{
 const {doc,floor,building}=fixture();Object.assign(floor,{rooms:[],hallways:[],staircases:[],elevators:[]});doc.panoramas=[];doc.qrCheckpoints=[]
 floorConnectionsApplyHandler.execute(doc,{buildingId:'b',floorId:'f',connections:[suggestFloorConnections(building,floor).find(r=>r.portKey==='entrance:e')]})
 const before=structuredClone(doc.buildings),payload={entityId:'e',changes:{position:{x:7,y:0}}},result=entityUpdateHandler.execute(doc,payload)
 expect(result.success,result.error).toBe(true);expect(floor.routeNetwork.nodes.find((n:any)=>n.id===floor.entrances[0].routeNodeId).position).toEqual({x:7,y:0})
 const undo=entityUpdateHandler.inverse!(payload,result)!;entityUpdateHandler.execute(doc,undo.payload);expect(doc.buildings).toEqual(before)
})
it('rejects moving an attached door across a blocking wall without mutating its graph',()=>{
 const {doc,floor,building}=fixture();floorConnectionsApplyHandler.execute(doc,{buildingId:'b',floorId:'f',connections:[suggestFloorConnections(building,floor).find(r=>r.portKey==='door:d')]})
 floor.walls.push({id:'barrier',start:{x:4,y:.1},end:{x:4,y:2.9},height:3,thickness:.2})
 const before=JSON.stringify(doc),result=doorUpdateHandler.execute(doc,{doorId:'d',patch:{position:{x:6,y:0}}})
 expect(result.success).toBe(false);expect(JSON.stringify(doc)).toBe(before)
})
it('prevents independent node dragging from detaching an owned feature access',()=>{
 const {doc,floor,building}=fixture();floorConnectionsApplyHandler.execute(doc,{buildingId:'b',floorId:'f',connections:[suggestFloorConnections(building,floor).find(r=>r.portKey==='stair:s')]})
 const before=JSON.stringify(doc),result=routeNodeUpdateHandler.execute(doc,{nodeId:building.staircases[0].levels[0].routeConnection.anchorNodeId,patch:{position:{x:9,y:9}}})
 expect(result.success).toBe(false);expect(JSON.stringify(doc)).toBe(before)
})

it('supports legacy nested doors without extracting or losing them on undo',()=>{
 const {doc,floor,building}=fixture();floor.rooms=[{id:'room',roomDoors:floor.doors}];delete floor.doors
 const before=structuredClone(doc.buildings),payload={buildingId:'b',floorId:'f',connections:suggestFloorConnections(building,floor).filter(r=>r.portKey==='door:d')}
 expect(payload.connections).toHaveLength(1);const result=floorConnectionsApplyHandler.execute(doc,payload);expect(result.success,result.error).toBe(true)
 expect(floor.doors).toBeUndefined();expect(floor.rooms[0].roomDoors[0].routeConnection).toBeTruthy()
 const undo=floorConnectionsApplyHandler.inverse!(payload,result)!;floorConnectionsApplyHandler.execute(doc,undo.payload);expect(doc.buildings).toEqual(before)
})
it('redoes connections with stable identities so a dependent route can also redo',async()=>{
 const {doc,floor,building}=fixture(),registry=new CommandRegistry(),bus=new DocumentEventBus(),store=new DocumentStore(doc,bus)
 registry.register(floorConnectionsApplyHandler);registry.register(routePathCreateHandler)
 const dispatcher=new CommandDispatcher(registry,doc,bus),history=new HistoryStack(dispatcher,doc,registry,8,store),context:any={document:doc,get:(id:string)=>({dispatcher,eventBus:bus,documentStore:store})[id]}
 await dispatcher.init(context);await history.init(context);dispatcher.addPreHook(history);dispatcher.addPostHook(history)
 dispatcher.execute({id:'floor.connections.apply',label:'Connect floor',payload:{buildingId:'b',floorId:'f',connections:suggestFloorConnections(building,floor).filter(r=>r.portKey==='stair:s')}})
 const conn=structuredClone(building.staircases[0].levels[0].routeConnection),target=floor.routeNetwork.nodes.find((n:any)=>n.id===conn.targetRouteNodeId)
 const afterConnections=structuredClone(doc.buildings)
 const result=dispatcher.execute({id:'route.path.create',label:'Dependent route',payload:{buildingId:'b',floorId:'f',points:[{...target.position,existingNodeId:target.id},{x:4,y:5}]}});expect(result.success,result.error).toBe(true)
 history.undo();history.undo();history.redo();expect(doc.buildings).toEqual(afterConnections)
 history.redo();expect(floor.routeNetwork.edges.some((e:any)=>e.from===target.id||e.to===target.id)).toBe(true);expect(floor.routeNetwork.nodes.some((n:any)=>n.position.y===5)).toBe(true)
})

it('removes a deleted door owned stub and restores the exact graph on undo',()=>{
 const {doc,floor,building}=fixture();floorConnectionsApplyHandler.execute(doc,{buildingId:'b',floorId:'f',connections:suggestFloorConnections(building,floor).filter(r=>r.portKey==='door:d')})
 const conn=floor.doors[0].routeConnection,before=structuredClone(doc.buildings),payload={doorId:'d'},result=doorDeleteHandler.execute(doc,payload)
 expect(result.success).toBe(true);expect(floor.routeNetwork.edges.some((e:any)=>e.id===conn.connectorEdgeId)).toBe(false)
 const undo=doorDeleteHandler.inverse!(payload,result)!;doorCreateHandler.execute(doc,undo.payload);expect(doc.buildings).toEqual(before)
})
it('removes a deleted entrance owned stub while preserving the main route',()=>{
 const {doc,floor,building}=fixture();floorConnectionsApplyHandler.execute(doc,{buildingId:'b',floorId:'f',connections:suggestFloorConnections(building,floor).filter(r=>r.portKey==='entrance:e')})
 const conn=floor.entrances[0].routeConnection,backbone=floor.routeNetwork.edges.filter((e:any)=>e.id!==conn.connectorEdgeId)
 expect(entranceDeleteHandler.execute(doc,{entranceId:'e'}).success).toBe(true)
 expect(floor.routeNetwork.edges).toEqual(backbone);expect(floor.routeNetwork.nodes.some((n:any)=>n.id===conn.anchorNodeId)).toBe(false)
})
