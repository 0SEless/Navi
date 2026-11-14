import { describe, expect, it } from 'vitest'
import type { Opening, Wall } from '@navi/core'
import { projectPoint, screenRay, wallFacePoint, intersectWallFace, pickArchitecture } from '../architecture-3d-math'
const wall: Wall={id:'front',start:{x:0,y:0},end:{x:10,y:0},thickness:.4,height:4}
const opening: Opening={id:'window',type:'window',wallId:'front',offset:3,width:2,sillHeight:1,height:2}
const ray=(x=4,z=2)=>({origin:{x,y:-5,z},direction:{x:0,y:1,z:0}})
describe('facade math',()=>{
 it('round trips perspective and rejects missing/singular frames and points behind camera',()=>{
  const frame={matrix:[1,0,0,0,0,1,0,0,0,0,-1,-1,0,0,-2,0],width:800,height:600}
  const point={x:.7,y:.2,z:-5},screen=projectPoint(frame,point)!,r=screenRay(frame,screen)!
  const t=(point.z-r.origin.z)/r.direction.z
  expect(r.origin.x+t*r.direction.x).toBeCloseTo(point.x,9)
  expect(r.origin.y+t*r.direction.y).toBeCloseTo(point.y,9)
  expect(projectPoint(frame,{x:0,y:0,z:2})).toBeNull()
  expect(screenRay({...frame,matrix:new Array(16).fill(0)},screen)).toBeNull()
  expect(screenRay(null,screen)).toBeNull()
 })
 it.each([1,-1] as const)('intersects diagonal facade side %s',side=>{
  const diagonal={...wall,end:{x:6,y:8}},point=wallFacePoint(diagonal,3,2,side)!
  const r={origin:{x:point.x-8*side,y:point.y+6*side,z:2},direction:{x:.8*side,y:-.6*side,z:0}}
  expect(intersectWallFace(r,diagonal,side)).toMatchObject({offset:expect.closeTo(3),side,z:2,facade:true})
  expect(intersectWallFace({origin:point,direction:{x:.6,y:.8,z:0}},diagonal,side)).toBeNull()
  expect(wallFacePoint({...wall,end:wall.start},2,2,side)).toBeNull()
 })
 it('selects open window logical ID from both sides',()=>{
  expect(pickArchitecture(ray(),[wall],[opening])).toMatchObject({openingId:'window',side:-1})
  expect(pickArchitecture({origin:{x:4,y:5,z:2},direction:{x:0,y:-1,z:0}},[wall],[opening])).toMatchObject({openingId:'window',side:1})
 })
 it('solid hides rear window but a door hole permits it',()=>{
  const rear={...wall,id:'rear',start:{x:0,y:3},end:{x:10,y:3}},rearWindow={...opening,wallId:'rear'}
  expect(pickArchitecture(ray(),[wall,rear],[rearWindow])).toMatchObject({wallId:'front'})
  const door: Opening={id:'door',type:'door',wallId:'front',offset:3,width:2,height:3}
  expect(pickArchitecture(ray(),[wall,rear],[door,rearWindow])).toMatchObject({wallId:'rear',openingId:'window'})
 })
 it('selects top, end and aperture reveal solids',()=>{
  expect(pickArchitecture({origin:{x:1,y:0,z:8},direction:{x:0,y:0,z:-1}},[wall],[])).toMatchObject({wallId:'front',facade:false,z:4})
  expect(pickArchitecture({origin:{x:-2,y:0,z:2},direction:{x:1,y:0,z:0}},[wall],[])).toMatchObject({wallId:'front',facade:false,offset:0})
  expect(pickArchitecture({origin:{x:4,y:0,z:2},direction:{x:1,y:0,z:0}},[wall],[opening])).toMatchObject({wallId:'front',facade:false,offset:5})
 })
})

it.each([[0,30,.5],[47,55,1],[125,70,3]])('projects and inverses rotated pitched camera bearing=%s pitch=%s zoomScale=%s',(bearing,pitch,scale)=>{
 const multiply=(a:number[],b:number[])=>Array.from({length:16},(_,i)=>[0,1,2,3].reduce((v,k)=>v+a[k*4+i%4]*b[Math.floor(i/4)*4+k],0))
 const br=bearing*Math.PI/180,pr=pitch*Math.PI/180,c=Math.cos(br),s=Math.sin(br),cp=Math.cos(pr),sp=Math.sin(pr)
 const rotate=[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]
 const tilt=[1,0,0,0,0,cp,sp,0,0,-sp,cp,0,0,0,0,1]
 const view=[scale,0,0,0,0,scale,0,0,0,0,scale,0,0,0,-40,1]
 const perspective=[1.3,0,0,0,0,1.7,0,0,0,0,-1.01,-1,0,0,-2.01,0]
 const frame={matrix:multiply(perspective,multiply(view,multiply(tilt,rotate))),width:1100,height:710}
 const diagonal={...wall,start:{x:-2,y:-1},end:{x:4,y:7}},point=wallFacePoint(diagonal,3,2,1)!
 const screen=projectPoint(frame,point)!,ray=screenRay(frame,screen)!,hit=intersectWallFace(ray,diagonal,1)!
 expect(hit.offset).toBeCloseTo(3,8);expect(hit.z).toBeCloseTo(2,8)
})

it('rejects malformed nonfinite aperture regions rather than selecting an invented window',()=>{
 const invalid={...opening,width:Infinity}
 expect(pickArchitecture(ray(),[wall],[invalid],[])).toBeNull()
})


