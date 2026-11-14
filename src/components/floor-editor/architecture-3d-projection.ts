import { MercatorCoordinate } from 'maplibre-gl'
import { styleReady } from '@/lib/terrain/style-ready'
import type { Map as LibreMap, CustomLayerInterface } from 'maplibre-gl'
import type { CoordinateTransformer } from '@navi/core'
import { projectPoint, screenRay } from './architecture-3d-math'
import type { Point3, ProjectionFrame, Ray3, ScreenPoint } from './architecture-3d-math'

export interface ArchitectureProjectionSnapshot {
 project(point: Point3): ScreenPoint | null
 ray(screen: ScreenPoint): Ray3 | null
}
export interface ArchitectureProjection extends ArchitectureProjectionSnapshot {
 getFrame(): ProjectionFrame | null
 capture(): ArchitectureProjectionSnapshot | null
 subscribe(listener: () => void): () => void
 dispose(): void
}
type Transformer = Pick<CoordinateTransformer,'buildingLocalToWorld'|'worldToBuildingLocal'>
let nextId=0
const valid=(p:Point3)=>[p.x,p.y,p.z].every(Number.isFinite)
/** Capture the registered building's affine Mercator XY conversion, never floor elevation.
 * The three samples preserve building rotation and freeze mutable transformer state.
 * Z uses MapLibre's latitude-dependent conformal altitude conversion.
 */
function localSnapshot(frame: ProjectionFrame,transformer: Transformer,buildingId: string): ArchitectureProjectionSnapshot | null {
 const sample=(x:number,y:number)=>{
  const world=transformer.buildingLocalToWorld({x,y},buildingId)
  return world&&Number.isFinite(world.lat+world.lng)?MercatorCoordinate.fromLngLat(world,0):null
 }
 const o=sample(0,0),x=sample(1,0),y=sample(0,1);if(!o||!x||!y) return null
 const xx=x.x-o.x,xy=x.y-o.y,yx=y.x-o.x,yy=y.y-o.y,det=xx*yy-xy*yx
 if(!Number.isFinite(det)||Math.abs(det)<1e-30) return null
 const toLocal=(p:Point3):Point3=>{
  const dx=p.x-o.x,dy=p.y-o.y,m=new MercatorCoordinate(p.x,p.y,p.z)
  return {x:(dx*yy-dy*yx)/det,y:(dy*xx-dx*xy)/det,z:m.toAltitude()}
 }
 return {
  project(point) {
   if(!valid(point)) return null
   const mx=o.x+point.x*xx+point.y*yx,my=o.y+point.x*xy+point.y*yy
   const merc=new MercatorCoordinate(mx,my,0)
   merc.z=point.z*merc.meterInMercatorCoordinateUnits()
   return projectPoint(frame,merc)
  },
  ray(screen) {
   const ray=screenRay(frame,screen);if(!ray) return null
   // Recover the ray in the active-floor neighborhood, not from a distant far
   // plane where conformal altitude scale can differ from the building's scale.
   const near=toLocal(ray.origin)
   if(Math.abs(ray.direction.z)<1e-15) {
    const far=toLocal({x:ray.origin.x+ray.direction.x*1e-6,y:ray.origin.y+ray.direction.y*1e-6,z:ray.origin.z+ray.direction.z*1e-6})
    const d={x:far.x-near.x,y:far.y-near.y,z:far.z-near.z},length=Math.hypot(d.x,d.y,d.z)
    return length>0?{origin:near,direction:{x:d.x/length,y:d.y/length,z:d.z/length}}:null
   }
   const atAltitude=(altitude:number)=>{
    let t=(altitude*o.meterInMercatorCoordinateUnits()-ray.origin.z)/ray.direction.z
    for(let i=0;i<4;i++) {
     const p=new MercatorCoordinate(ray.origin.x+t*ray.direction.x,ray.origin.y+t*ray.direction.y,0)
     t=(altitude*p.meterInMercatorCoordinateUnits()-ray.origin.z)/ray.direction.z
    }
    return toLocal({x:ray.origin.x+t*ray.direction.x,y:ray.origin.y+t*ray.direction.y,z:ray.origin.z+t*ray.direction.z})
   }
   const a=atAltitude(0),b=atAltitude(1),dz=ray.direction.z>0?1:-1
   const delta={x:(b.x-a.x)*dz,y:(b.y-a.y)*dz,z:(b.z-a.z)*dz}
   const origin={x:a.x+(b.x-a.x)*near.z,y:a.y+(b.y-a.y)*near.z,z:near.z}
   const length=Math.hypot(delta.x,delta.y,delta.z)
   if(!valid(origin)||!valid(delta)||!Number.isFinite(length)||length===0) return null
   return {origin,direction:{x:delta.x/length,y:delta.y/length,z:delta.z/length}}
  },
 }
}
/** MapLibre 5.24 no-draw 3D layer: mainMatrix consumes normalized Mercator XYZ.
 * Does not read or change WebGL state. Unsupported projections invalidate frame.
 */
export function createArchitectureProjection(map: LibreMap,transformer: Transformer,buildingId: string): ArchitectureProjection {
 const id=`architecture-projection-${++nextId}`,listeners=new Set<()=>void>()
 let disposed=false,frame: ProjectionFrame | null=null,snapshot: ArchitectureProjectionSnapshot | null=null
 const container=map.getContainer()
 let width=container.clientWidth,height=container.clientHeight
 const notify=()=>listeners.forEach(fn=>fn())
 const invalidate=()=>{frame=null;snapshot=null;notify()}
 const resize=()=>{width=container.clientWidth;height=container.clientHeight;invalidate()}
 const layer: CustomLayerInterface={id,type:'custom',renderingMode:'3d',render(_gl,input) {
  if(disposed) return
  const data=input.defaultProjectionData
  // MapLibre 5.24 exposes the optional authored stylesheet value, not the resolved default.
  if((map.getProjection()?.type??'mercator')!=='mercator'||!data?.mainMatrix||data.projectionTransition!==0||width<=0||height<=0||data.mainMatrix.length!==16||!Array.from(data.mainMatrix).every(Number.isFinite)) {invalidate();return}
  frame={matrix:Float64Array.from(data.mainMatrix),width,height}
  snapshot=localSnapshot(frame,transformer,buildingId)
  if(!snapshot) frame=null
  notify()
 },onRemove(){invalidate()}}
 const ensureLayer=()=>{if(!disposed&&styleReady(map)&&!map.getLayer(id)) {map.addLayer(layer);map.triggerRepaint()}}
 const style=()=>{if(!map.getLayer(id)) invalidate();ensureLayer()}
 const canvas=map.getCanvas?.()
 const contextLost=()=>invalidate()
 map.on('resize',resize);map.on('styledata',style);map.on('style.load',style)
 canvas?.addEventListener('webglcontextlost',contextLost)
 canvas?.addEventListener('webglcontextrestored',contextLost)
 ensureLayer()
 return {
  project:point=>snapshot?.project(point)??null,
  ray:screen=>snapshot?.ray(screen)??null,
  getFrame:()=>frame?{...frame,matrix:Float64Array.from(frame.matrix)}:null,
  capture:()=>snapshot,
  subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener)}},
  dispose(){if(disposed) return;disposed=true;map.off('resize',resize);map.off('styledata',style);map.off('style.load',style);canvas?.removeEventListener('webglcontextlost',contextLost);canvas?.removeEventListener('webglcontextrestored',contextLost);if(map.getLayer(id)) map.removeLayer(id);frame=null;snapshot=null;listeners.clear()},
 }
}




