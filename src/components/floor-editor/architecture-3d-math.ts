import { buildWallOpeningVolumes } from '@navi/core'
import type { Opening, Wall } from '@navi/core'

export interface Point3 { x: number; y: number; z: number }
export interface ScreenPoint { x: number; y: number }
export interface Ray3 { origin: Point3; direction: Point3 }
export type WallSide = 1 | -1
/** Column-major clip-from-normalized-Mercator matrix; viewport is CSS pixels. */
export interface ProjectionFrame { matrix: ArrayLike<number>; width: number; height: number }
export interface ArchitectureHit { wallId: string; openingId?: string; offset: number; z: number; side: WallSide; point: Point3; distance: number; facade: boolean }
const EPS = 1e-8
const finite = (p: Point3) => [p.x,p.y,p.z].every(Number.isFinite)
const subtract = (a: Point3,b: Point3): Point3 => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z})
const dot = (a: Point3,b: Point3) => a.x*b.x+a.y*b.y+a.z*b.z
const cross = (a: Point3,b: Point3): Point3 => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x})
function transform(m: ArrayLike<number>, p: Point3, w=1) {
 return [0,1,2,3].map(row=>m[row]*p.x+m[4+row]*p.y+m[8+row]*p.z+m[12+row]*w)
}
function validFrame(frame: ProjectionFrame | null): frame is ProjectionFrame {
 return !!frame && frame.width>0 && frame.height>0 && Number.isFinite(frame.width+frame.height) && frame.matrix.length===16 && Array.from(frame.matrix).every(Number.isFinite)
}
export function invertMatrix(matrix: ArrayLike<number>): Float64Array | null {
 const rows=Array.from({length:4},(_,r)=>Array.from({length:8},(_,c)=>c<4?matrix[c*4+r]:Number(c-4===r)))
 for(let c=0;c<4;c++) {
  let pivot=c
  for(let r=c+1;r<4;r++) if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c])) pivot=r
  if(!Number.isFinite(rows[pivot][c]) || Math.abs(rows[pivot][c])<1e-30) return null
  ;[rows[c],rows[pivot]]=[rows[pivot],rows[c]]
  const scale=rows[c][c]; rows[c]=rows[c].map(v=>v/scale)
  for(let r=0;r<4;r++) if(r!==c) { const factor=rows[r][c]; rows[r]=rows[r].map((v,i)=>v-factor*rows[c][i]) }
 }
 const result=Float64Array.from({length:16},(_,i)=>rows[i%4][4+Math.floor(i/4)])
 return Array.from(result).every(Number.isFinite)?result:null
}
export function projectPoint(frame: ProjectionFrame | null, point: Point3): ScreenPoint | null {
 if(!validFrame(frame)||!finite(point)) return null
 const [x,y,,w]=transform(frame.matrix,point)
 if(w<=0 || ![x,y,w].every(Number.isFinite)) return null
 const result={x:(x/w+1)*frame.width/2,y:(1-y/w)*frame.height/2}
 return Number.isFinite(result.x+result.y)?result:null
}
export function screenRay(frame: ProjectionFrame | null, screen: ScreenPoint): Ray3 | null {
 if(!validFrame(frame)||![screen.x,screen.y].every(Number.isFinite)) return null
 const inverse=invertMatrix(frame.matrix); if(!inverse) return null
 const unproject=(z:number): Point3 | null=>{
  const [x,y,pz,w]=transform(inverse,{x:2*screen.x/frame.width-1,y:1-2*screen.y/frame.height,z})
  if(w===0) return null
  const p={x:x/w,y:y/w,z:pz/w};return finite(p)?p:null
 }
 const origin=unproject(-1),far=unproject(.5);if(!origin||!far) return null
 const delta=subtract(far,origin),length=Math.hypot(delta.x,delta.y,delta.z)
 return length>0?{origin,direction:{x:delta.x/length,y:delta.y/length,z:delta.z/length}}:null
}
function basis(wall: Wall) {
 const dx=wall.end.x-wall.start.x,dy=wall.end.y-wall.start.y,length=Math.hypot(dx,dy)
 if(![dx,dy,wall.start.x,wall.start.y,wall.height,wall.thickness].every(Number.isFinite)||length<=EPS||wall.height<=0||wall.thickness<=0) return null
 return {length,ux:dx/length,uy:dy/length,nx:-dy/length,ny:dx/length}
}
export function wallFacePoint(wall: Wall, offset: number,z: number,side: WallSide): Point3 | null {
 const b=basis(wall);if(!b||![offset,z].every(Number.isFinite)) return null
 return {x:wall.start.x+b.ux*offset+b.nx*side*wall.thickness/2,y:wall.start.y+b.uy*offset+b.ny*side*wall.thickness/2,z}
}
function hitAt(ray: Ray3,wall: Wall,t: number): ArchitectureHit | null {
 const b=basis(wall); if(!b||!finite(ray.origin)||!finite(ray.direction)||t<0||!Number.isFinite(t)) return null
 const point={x:ray.origin.x+t*ray.direction.x,y:ray.origin.y+t*ray.direction.y,z:ray.origin.z+t*ray.direction.z}
 const dx=point.x-wall.start.x,dy=point.y-wall.start.y,normal=dx*b.nx+dy*b.ny
 return {wallId:wall.id,offset:dx*b.ux+dy*b.uy,z:point.z,side:normal>=0?1:-1,point,distance:t*Math.hypot(ray.direction.x,ray.direction.y,ray.direction.z),facade:Math.abs(Math.abs(normal)-wall.thickness/2)<EPS}
}
/** bounded=false intersects the infinite captured facade plane for move/resize drags. */
export function intersectWallFace(ray: Ray3, wall: Wall,side: WallSide,bounded=true): ArchitectureHit | null {
 const b=basis(wall),p=wallFacePoint(wall,0,0,side);if(!b||!p) return null
 const denominator=ray.direction.x*b.nx+ray.direction.y*b.ny
 if(Math.abs(denominator)<=EPS*Math.hypot(ray.direction.x,ray.direction.y,ray.direction.z)) return null
 const t=((p.x-ray.origin.x)*b.nx+(p.y-ray.origin.y)*b.ny)/denominator
 const hit=hitAt(ray,wall,t);if(!hit) return null
 if(bounded&&(hit.offset < -EPS||hit.offset>b.length+EPS||hit.z < -EPS||hit.z>wall.height+EPS)) return null
 return {...hit,side,facade:true}
}
function triangleDistance(ray: Ray3,a: Point3,b: Point3,c: Point3): number | null {
 const e1=subtract(b,a),e2=subtract(c,a),h=cross(ray.direction,e2),det=dot(e1,h)
 if(Math.abs(det)<EPS*Math.hypot(e1.x,e1.y,e1.z)*Math.hypot(h.x,h.y,h.z)) return null
 const s=subtract(ray.origin,a),u=dot(s,h)/det;if(u < -EPS||u>1+EPS) return null
 const q=cross(s,e1),v=dot(ray.direction,q)/det;if(v < -EPS||u+v>1+EPS) return null
 const t=dot(e2,q)/det;return t>=0&&Number.isFinite(t)?t:null
}
/** Solids must be LOCAL meter footprints (base/height are absolute bottom/top). */
export function pickArchitecture(ray: Ray3,walls: readonly Wall[],openings: readonly Opening[],solidFeatures?: GeoJSON.FeatureCollection<GeoJSON.Polygon> | readonly GeoJSON.Feature<GeoJSON.Polygon>[]): ArchitectureHit | null {
 if(!finite(ray.origin)||!finite(ray.direction)) return null
 const solids=solidFeatures ?? buildWallOpeningVolumes(walls,openings,[],[],0).collection
 const features='features' in solids?solids.features:solids
 const wallById=new Map(walls.map(w=>[w.id,w]));let closest: ArchitectureHit | null=null
 const consider=(hit: ArchitectureHit | null)=>{if(hit&&(!closest||hit.distance<closest.distance-EPS)) closest=hit}
 for(const feature of features) {
  const wall=wallById.get(String(feature.properties?.wallId??''));if(!wall||!basis(wall)) continue
  const low=Number(feature.properties?.base),high=Number(feature.properties?.height),ring=feature.geometry.coordinates[0]
  if(!Number.isFinite(low+high)||high<=low||!ring||ring.length<4) continue
  const bottom=ring.slice(0,-1).map(([x,y])=>({x,y,z:low})),top=bottom.map(p=>({...p,z:high}))
  const test=(a:Point3,b:Point3,c:Point3,facadeAllowed=true)=>{const t=triangleDistance(ray,a,b,c);if(t!==null) {const h=hitAt(ray,wall,t);if(h&&!facadeAllowed) h.facade=false;consider(h)}}
  for(let i=1;i<bottom.length-1;i++) {test(bottom[0],bottom[i],bottom[i+1],false);test(top[0],top[i],top[i+1],false)}
  for(let i=0;i<bottom.length;i++) {const j=(i+1)%bottom.length;test(bottom[i],bottom[j],top[j]);test(bottom[i],top[j],top[i])}
 }
 for(const opening of openings) {
  if(opening.type!=='window'||![opening.offset,opening.width,opening.sillHeight??.9,opening.height??1.2].every(Number.isFinite)||opening.width<=0||(opening.height??1.2)<=0) continue
  const wall=wallById.get(opening.wallId);if(!wall) continue
  for(const side of [1,-1] as const) {
   const h=intersectWallFace(ray,wall,side);if(!h) continue
   const sill=opening.sillHeight??.9,height=opening.height??1.2
   if(h.offset>=opening.offset-EPS&&h.offset<=opening.offset+opening.width+EPS&&h.z>=sill-EPS&&h.z<=sill+height+EPS) consider({...h,openingId:opening.id})
  }
 }
 return closest
}

