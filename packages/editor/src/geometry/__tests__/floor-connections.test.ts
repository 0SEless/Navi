import {expect,it} from 'vitest'
import {getFloorPorts,suggestFloorConnections,floorConnectionSignature} from '../floor-connections'
const fixture=()=>{const floor:any={id:'f',level:0,entrances:[{id:'e',name:'Entrance',position:{x:8,y:0}}],doors:[{id:'d',name:'Door',width:1,depth:.2,doorType:'standard',position:{x:2,y:0},wallAttachment:{wallId:'wall',offset:2,openingHeight:2.1},metadata:{}}],walls:[{id:'wall',start:{x:0,y:0},end:{x:10,y:0},height:3,thickness:.2}],openings:[],routeNetwork:{nodes:[{id:'a',type:'waypoint',position:{x:0,y:3},floor:0},{id:'b',type:'waypoint',position:{x:10,y:3},floor:0}],edges:[{id:'spine',from:'a',to:'b',type:'walk',distance:10}]}};const building:any={id:'b',floors:[floor],staircases:[{id:'s',name:'Stair',levels:{0:{position:{x:4,y:1},rotation:0}}}],elevators:[{id:'lift',name:'Lift',levels:{0:{position:{x:6,y:1},rotation:0}}}]};return {floor,building,doc:{schemaVersion:1,version:0,metadata:{campusId:'c'},roads:[],buildings:[building]} as any}}

it('suggests doors, entrances and both vertical kinds on existing route segments without mutating the floor',()=>{
 const {floor,building}=fixture(),before=JSON.stringify({floor,building}),rows=suggestFloorConnections(building,floor)
 expect(getFloorPorts(building,floor).map(p=>p.kind)).toEqual(['door','entrance','stair','elevator'])
 expect(rows).toHaveLength(4);expect(rows.every(row=>row.target?.edgeId==='spine'&&row.accepted)).toBe(true)
 expect(JSON.stringify({floor,building})).toBe(before)
})
it('refuses wall-crossing suggestions and preserves authored connections by default',()=>{
 const {floor,building}=fixture();floor.walls.push({id:'barrier',start:{x:0,y:2},end:{x:10,y:2},height:3,thickness:.2})
 expect(suggestFloorConnections(building,floor).every(row=>!row.accepted)).toBe(true)
 floor.walls.pop();floor.doors[0].routeConnection={anchorNodeId:'owned',targetRouteNodeId:'a',connectorEdgeId:'owned-edge'}
 const row=suggestFloorConnections(building,floor).find(row=>row.portKey==='door:d')!
 expect(row.existing).toBe(true);expect(row.accepted).toBe(false)
})
it('fingerprints route and obstruction edits so a stale preview cannot be confirmed',()=>{
 const {floor,building}=fixture(),before=floorConnectionSignature(building,floor);floor.routeNetwork.nodes[0].position.y=4
 expect(floorConnectionSignature(building,floor)).not.toBe(before)
})
