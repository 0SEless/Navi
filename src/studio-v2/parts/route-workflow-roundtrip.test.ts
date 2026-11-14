import {normalizeDocument} from '../../../packages/compiler/src/normalize'
import {floorConnectionsApplyHandler} from '../../../packages/editor/src/commands/floor-route-workflow'
import {suggestFloorConnections} from '../../../packages/editor/src/geometry/floor-connections'
import {expect,it} from 'vitest'
import {serializeDocument,deserializeDocument} from '@navi/core'
import {entranceOutdoorConnectHandler} from '../../../packages/editor/src/commands/floor-route-workflow'
import {CampusCompiler} from '../../../packages/compiler/src/pipeline/campus-compiler'
import {fixtureMinimal} from '../__fixtures__/campus-fixtures'
import {splitDocument} from './split'
import {joinParts} from './join'
it('persists and compiles an outdoor-only entrance terminal without an indoor path',()=>{
 const doc=fixtureMinimal(),b=doc.buildings[0],f=b.floors[0],origin=b.footprint.points[0],road={id:'road',name:'Path',type:'pedestrian' as const,width:2,surface:'paved' as const,polyline:{points:[origin,{lat:origin.lat,lng:origin.lng+.0001}]},metadata:{}}
 doc.roads=[road]
 doc.buildings=[b];b.floors=[f];b.staircases=[];b.elevators=[];f.rooms=[];f.hallways=[];f.staircases=[];f.elevators=[];f.connectorStops=[];f.doors=[];f.walls=[];f.openings=[];f.routeNetwork=undefined;f.entranceAccess=undefined
 f.entrances=[{id:'entry',name:'Entrance',position:{x:0,y:0},width:1,type:'main',accessible:true,level:f.level,metadata:{}}]
 expect(entranceOutdoorConnectHandler.execute(doc,{buildingId:b.id,floorId:f.id,entranceId:'entry',outdoorNodeId:'selected',outdoorRouteId:road.id,outdoorPosition:road.polyline.points[0]}).success).toBe(true)
 const joined=joinParts(splitDocument(deserializeDocument(serializeDocument(doc))).parts),out=joined.buildings[0].floors[0]
 expect(out.entrances[0].routeNodeId).toBeTruthy();expect(out.routeNetwork!.edges).toHaveLength(0)
 const compiled=new CampusCompiler().compileV2(joined)
 expect(compiled.success,JSON.stringify(compiled)).toBe(true)
 expect(compiled.artifacts!.floorGeometry!.buildings[0].floors[0].entranceAccess).toHaveLength(1)
})

it('persists explicit floor ports and uses canonical floor doors over stale legacy room copies',()=>{
 const doc=fixtureMinimal(),b=doc.buildings[0],f=b.floors[0],room:any={id:'room',name:'Room',number:'1',category:'classroom',metadata:{},polygon:{points:[{x:0,y:0},{x:5,y:0},{x:5,y:-4},{x:0,y:-4}]}}
 doc.buildings=[b];b.floors=[f];b.elevators=[];b.staircases=[];f.entrances=[];f.hallways=[];f.staircases=[];f.elevators=[];f.connectorStops=[];f.walls=[];f.openings=[]
 const door:any={id:'auth-door',roomId:room.id,ownership:{status:'assigned'},position:{x:2,y:0},width:1,doorType:'standard',metadata:{}}
 room.roomDoors=[structuredClone(door)];f.rooms=[room];f.doors=[door]
 b.staircases=[{id:'auth-stair',name:'Stair',fromLevel:f.level,toLevel:f.level,levels:{[f.level]:{position:{x:4,y:0},rotation:0}},metadata:{}} as any]
 f.routeNetwork={nodes:[{id:'a',type:'waypoint',position:{x:0,y:3},floor:f.level},{id:'b',type:'waypoint',position:{x:10,y:3},floor:f.level}],edges:[{id:'spine',from:'a',to:'b',type:'walk',distance:10}]}
 const rows=suggestFloorConnections(b,f).map(r=>({...r,accepted:true}))
 expect(floorConnectionsApplyHandler.execute(doc,{buildingId:b.id,floorId:f.id,connections:rows}).success).toBe(true)
 const joined=joinParts(splitDocument(deserializeDocument(serializeDocument(doc))).parts),out=joined.buildings[0],floor=out.floors[0]
 expect(floor.doors![0].routeConnection).toEqual(f.doors![0].routeConnection)
 expect(out.staircases![0].levels[f.level].routeConnection).toEqual(b.staircases[0].levels[f.level].routeConnection)
 const normalized=normalizeDocument(joined).document.buildings[0]
 expect(normalized.floors[0].rooms.find(r=>r.id===room.id)!.doors[0].properties.routeConnection).toEqual(f.doors![0].routeConnection)
 const compiled=new CampusCompiler().compileV2(joined)
 // This isolated floor deliberately has no outdoor entrance or second stair
 // stop: publish diagnostics are expected, but authored access must compile.
 const graph=compiled.graph!
 const stair=graph.nodes.find(n=>n.properties?.entityId==='auth-stair')!
 expect(stair).toBeTruthy()
 const access=graph.edges.find(e=>e.from===stair.id)!
 expect(access).toBeTruthy()
 expect(graph.nodes.find(n=>n.id===access.to)!.position).toEqual(stair.position)
 expect(graph.edges.some(e=>e.from===graph.nodes.find(n=>n.type==='poi')!.id)).toBe(true)
})
