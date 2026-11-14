import { expect, it, vi } from 'vitest'
import type { Map as LibreMap, CustomLayerInterface, CustomRenderMethodInput } from 'maplibre-gl'
import { createArchitectureProjection } from '../architecture-3d-projection'
it('captures copied mainMatrix, caches CSS resize, rejects globe, freezes gesture and disposes',()=>{
 let layer: CustomLayerInterface
 const events=new Map<string,()=>void>()
 const container={clientWidth:800,clientHeight:600}
 let projection='mercator'
 const map={getContainer:()=>container,getCanvasContainer:()=>container,getProjection:()=>({type:projection}),addLayer:(l:CustomLayerInterface)=>{layer=l},getLayer:()=>layer,on:(name:string,fn:()=>void)=>events.set(name,fn),off:vi.fn(),removeLayer:vi.fn(),triggerRepaint:vi.fn(),isStyleLoaded:()=>true} as unknown as LibreMap
 const transformer={buildingLocalToWorld:({x,y}:{x:number;y:number})=>({lng:x*.00001,lat:y*.00001}),worldToBuildingLocal:({lng,lat}:{lng:number;lat:number})=>({x:lng*100000,y:lat*100000})}
 const adapter=createArchitectureProjection(map,transformer,'b')
 const notify=vi.fn();adapter.subscribe(notify)
 const matrix=[2,0,0,0,0,2,0,0,0,0,1,0,-1,-1,0,1]
 const render=()=>layer!.render!({} as WebGLRenderingContext,{defaultProjectionData:{mainMatrix:matrix,projectionTransition:0}} as unknown as CustomRenderMethodInput)
 render();expect(adapter.getFrame()?.matrix).toBeInstanceOf(Float64Array)
 const frozen=adapter.capture()!; const before=frozen.project({x:3,y:2,z:1})!
 matrix[12]=0;render();expect(frozen.project({x:3,y:2,z:1})).toEqual(before)
 expect(adapter.project({x:3,y:2,z:1})).not.toEqual(before)
 container.clientWidth=400;render();expect(adapter.getFrame()?.width).toBe(800)
 events.get('resize')!();render();expect(adapter.getFrame()?.width).toBe(400)
 projection='globe';render();expect(adapter.ray({x:4,y:4})).toBeNull()
 expect(notify).toHaveBeenCalled();adapter.dispose();expect(map.removeLayer).toHaveBeenCalled()
})


it('matches MapLibre conformal height and inverses a rotated building at a nonzero floor level without adding elevation',async()=>{
 const {CoordinateTransformer}=await import('@navi/core')
 const {MercatorCoordinate}=await import('maplibre-gl')
 const {projectPoint}=await import('../architecture-3d-math')
 const transformer=new CoordinateTransformer()
 transformer.registerBuilding({buildingId:'b',origin:{lat:14.55,lng:121.03},rotation:37})
 transformer.registerFloor('b',7,{offset:{x:0,y:0},rotation:0})
 let layer: CustomLayerInterface
 const container={clientWidth:900,clientHeight:700}
 const map={getContainer:()=>container,getCanvasContainer:()=>container,getProjection:()=>({type:'mercator'}),addLayer:(l:CustomLayerInterface)=>{layer=l},getLayer:()=>layer,on:vi.fn(),off:vi.fn(),removeLayer:vi.fn(),triggerRepaint:vi.fn(),isStyleLoaded:()=>true} as unknown as LibreMap
 const adapter=createArchitectureProjection(map,transformer,'b')
 const center=MercatorCoordinate.fromLngLat({lat:14.55,lng:121.03}),s=1e6
 // Elevated pitched camera, expressed directly as clip-from-Mercator matrix.
 const matrix=[s,0,0,0,0,s*.6,s*.8,0,0,s*.8,-s*.6,0,-center.x*s,-center.y*s*.6,-center.y*s*.8,1]
 layer!.render!({} as WebGLRenderingContext,{defaultProjectionData:{mainMatrix:matrix,projectionTransition:0}} as unknown as CustomRenderMethodInput)
 const point={x:12,y:8,z:2.7},world=transformer.buildingLocalToWorld(point,'b')!,merc=MercatorCoordinate.fromLngLat(world,point.z)
 const expected=projectPoint({matrix,width:900,height:700},merc)!,actual=adapter.project(point)!
 expect(actual.x).toBeCloseTo(expected.x,3);expect(actual.y).toBeCloseTo(expected.y,3)
 const r=adapter.ray(actual)!,t=(point.z-r.origin.z)/r.direction.z
 expect(r.origin.x+t*r.direction.x).toBeCloseTo(point.x,3)
 expect(r.origin.y+t*r.direction.y).toBeCloseTo(point.y,3)
 adapter.dispose()
})

it('invalidates a missing capture matrix without throwing',()=>{
 let layer: CustomLayerInterface
 const map={getContainer:()=>({clientWidth:100,clientHeight:100}),getCanvasContainer:()=>({clientWidth:100,clientHeight:100}),getProjection:()=>({type:'mercator'}),addLayer:(l:CustomLayerInterface)=>{layer=l},getLayer:()=>layer,on:vi.fn(),off:vi.fn(),removeLayer:vi.fn(),triggerRepaint:vi.fn(),isStyleLoaded:()=>true} as unknown as LibreMap
 const transformer={buildingLocalToWorld:()=>({lng:0,lat:0}),worldToBuildingLocal:()=>({x:0,y:0})}
 const adapter=createArchitectureProjection(map,transformer,'b')
 expect(()=>layer!.render!({} as WebGLRenderingContext,{defaultProjectionData:{projectionTransition:0}} as unknown as CustomRenderMethodInput)).not.toThrow()
 expect(adapter.capture()).toBeNull();adapter.dispose()
})

it('accepts omitted style projection as MapLibre default Mercator and rejects explicit globe',()=>{
 let layer: CustomLayerInterface
 let projection: {type:string} | undefined = undefined
 const map={getContainer:()=>({clientWidth:100,clientHeight:100}),getCanvasContainer:()=>({clientWidth:100,clientHeight:100}),getProjection:()=>projection,addLayer:(l:CustomLayerInterface)=>{layer=l},getLayer:()=>layer,on:vi.fn(),off:vi.fn(),removeLayer:vi.fn(),triggerRepaint:vi.fn(),isStyleLoaded:()=>true} as unknown as LibreMap
 const transformer={buildingLocalToWorld:({x,y}:{x:number;y:number})=>({lng:x*.00001,lat:y*.00001}),worldToBuildingLocal:()=>({x:0,y:0})}
 const adapter=createArchitectureProjection(map,transformer,'b')
 const matrix=[2,0,0,0,0,2,0,0,0,0,1,0,-1,-1,0,1]
 const render=()=>layer!.render!({} as WebGLRenderingContext,{defaultProjectionData:{mainMatrix:matrix,projectionTransition:0}} as unknown as CustomRenderMethodInput)
 expect(render).not.toThrow();expect(adapter.capture()).not.toBeNull()
 expect(adapter.project({x:0,y:0,z:0})).toEqual({x:50,y:50})
 projection={type:'globe'};render();expect(adapter.capture()).toBeNull()
 adapter.dispose()
})



it('uses outer CSS viewport and installs as soon as style is ready while tiles remain pending',()=>{
 let layer: CustomLayerInterface | undefined
 const events=new Map<string,()=>void>()
 const map={style:{_loaded:false},getContainer:()=>({clientWidth:820,clientHeight:600}),getCanvasContainer:()=>({clientWidth:820,clientHeight:0}),getProjection:()=>undefined,addLayer:(l:CustomLayerInterface)=>{layer=l},getLayer:()=>layer,on:(name:string,fn:()=>void)=>events.set(name,fn),off:vi.fn(),removeLayer:vi.fn(),triggerRepaint:vi.fn(),isStyleLoaded:()=>false}
 const transformer={buildingLocalToWorld:({x,y}:{x:number;y:number})=>({lng:x*.00001,lat:y*.00001}),worldToBuildingLocal:()=>({x:0,y:0})}
 const adapter=createArchitectureProjection(map as unknown as LibreMap,transformer,'b')
 expect(layer).toBeUndefined()
 map.style._loaded=true
 events.get('style.load')?.()
 expect(layer).toBeDefined()
 const matrix=[2,0,0,0,0,2,0,0,0,0,1,0,-1,-1,0,1]
 layer!.render!({} as WebGLRenderingContext,{defaultProjectionData:{mainMatrix:matrix,projectionTransition:0}} as unknown as CustomRenderMethodInput)
 expect(adapter.getFrame()).toMatchObject({width:820,height:600})
 expect(adapter.project({x:0,y:0,z:0})).toEqual({x:410,y:300})
 adapter.dispose()
})
