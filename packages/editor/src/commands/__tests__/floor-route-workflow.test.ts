import {expect,it} from 'vitest'
import type {CampusDocument} from '@navi/core'
import {entranceOutdoorConnectHandler,floorRouteDrawHandler} from '../floor-route-workflow'
function fixture():CampusDocument{return {schemaVersion:1,version:0,metadata:{campusId:'c'},roads:[],buildings:[{id:'b',floors:[{id:'f',level:0,entrances:[{id:'entry',position:{x:1,y:1},name:'Entry'}],rooms:[],hallways:[],doors:[],staircases:[],elevators:[]}]}]} as unknown as CampusDocument}
it('connects one entrance outdoors without any indoor path, idempotently, then undoes absence exactly',()=>{
 const doc=fixture(),before=structuredClone(doc.buildings[0].floors[0]),p={buildingId:'b',floorId:'f',entranceId:'entry',outdoorNodeId:'outdoor'}
 const result=entranceOutdoorConnectHandler.execute(doc,p);expect(result.success).toBe(true)
 const f=doc.buildings[0].floors[0];expect(f.routeNetwork!.nodes).toHaveLength(1);expect(f.routeNetwork!.edges).toHaveLength(0)
 expect(f.entranceAccess![0].indoorRouteNodeId).toBe(f.routeNetwork!.nodes[0].id)
 entranceOutdoorConnectHandler.execute(doc,p);expect(f.routeNetwork!.nodes).toHaveLength(1);expect(f.entranceAccess).toHaveLength(1)
 const undo=entranceOutdoorConnectHandler.inverse!(p,result)!;expect(entranceOutdoorConnectHandler.execute(doc,undo.payload).success).toBe(true);expect(f).toEqual(before)
})
it('draws freely, attaches an entrance without outdoor assignment, reuses its port and restores exact snapshot',()=>{
 const doc=fixture(),before=structuredClone(doc.buildings[0].floors[0]),payload={buildingId:'b',floorId:'f',points:[{x:4,y:1},{x:1,y:1,entranceId:'entry'}]}
 const result=floorRouteDrawHandler.execute(doc,payload);expect(result.success).toBe(true)
 const f=doc.buildings[0].floors[0];expect(f.routeNetwork!.edges).toHaveLength(1);expect(f.entranceAccess).toBeUndefined();expect(f.entrances[0].routeNodeId).toBeTruthy()
 const port=f.entrances[0].routeNodeId
 expect(floorRouteDrawHandler.execute(doc,{...payload,points:[{x:1,y:1,entranceId:'entry'},{x:1,y:4}]}).success).toBe(true)
 expect(f.routeNetwork!.nodes.filter(n=>n.id===port)).toHaveLength(1)
 const undo=floorRouteDrawHandler.inverse!(payload,result)!;floorRouteDrawHandler.execute(doc,undo.payload);expect(f).toEqual(before)
})
it('keeps the indoor path when only the outdoor destination changes and fails atomically on missing entrances',()=>{
 const doc=fixture();floorRouteDrawHandler.execute(doc,{buildingId:'b',floorId:'f',points:[{x:1,y:1,entranceId:'entry'},{x:4,y:1}]})
 const f=doc.buildings[0].floors[0],network=structuredClone(f.routeNetwork)
 expect(entranceOutdoorConnectHandler.execute(doc,{buildingId:'b',floorId:'f',entranceId:'entry',outdoorNodeId:'new'}).success).toBe(true);expect(f.routeNetwork).toEqual(network)
 const before=JSON.stringify(doc)
 expect(floorRouteDrawHandler.execute(doc,{buildingId:'b',floorId:'f',points:[{x:0,y:0},{x:1,y:1,entranceId:'missing'}]}).success).toBe(false);expect(JSON.stringify(doc)).toBe(before)
})
