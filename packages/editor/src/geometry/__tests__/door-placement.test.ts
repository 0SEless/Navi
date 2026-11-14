import { describe, expect, it } from 'vitest'
import type { Wall } from '@navi/core'
import { findPlacementWall, projectWallDoorRectangle, projectWallWindow } from '../door-placement'
const wall=(patch:Partial<Wall>={}):Wall=>({id:'w',start:{x:0,y:0},end:{x:10,y:0},height:3.5,thickness:0.15,...patch})
describe('wall-bound placement geometry',()=>{
 it('uses perpendicular drag span for depth while the center stays on the wall',()=>{
  const result=projectWallDoorRectangle(wall(),{x:2,y:.1},{x:4,y:.7})
  expect(result.ok).toBe(true);if(!result.ok)return
  expect(result.rectangle.depth).toBeCloseTo(.6)
  expect(result.rectangle.center).toEqual({x:3,y:0})
  expect(result.rectangle.points[0].y).toBeCloseTo(-.3)
 })
 it('sizes depth relative to a vertical wall and refuses invalid host thickness',()=>{
  const result=projectWallDoorRectangle(wall({end:{x:0,y:10}}),{x:.1,y:2},{x:.7,y:4})
  expect(result.ok).toBe(true);if(result.ok){expect(result.rectangle.depth).toBeCloseTo(.6);expect(result.rectangle.center).toEqual({x:0,y:3});expect(result.rectangle.rotation).toBeCloseTo(Math.PI/2)}
  expect(projectWallDoorRectangle(wall({thickness:-1}),{x:2,y:0},{x:4,y:1}).ok).toBe(false)
 })
 it('chooses the unique nearby active-floor wall',()=>expect(findPlacementWall([wall()],{x:2,y:.1})).toMatchObject({ok:true,wall:{id:'w'}}))
 it('rejects missing walls and ambiguous corners',()=>{
  expect(findPlacementWall([],{x:1,y:0}).ok).toBe(false)
  expect(findPlacementWall([wall(),wall({id:'other',end:{x:0,y:10}})],{x:.1,y:.1}).ok).toBe(false)
 })
 it('centers and aligns a door rectangle on a diagonal wall',()=>{
  const result=projectWallDoorRectangle(wall({end:{x:10,y:10}}),{x:2,y:2.1},{x:4,y:4.1})
  expect(result.ok).toBe(true);if(!result.ok)return
  expect(result.rectangle.rotation).toBeCloseTo(Math.PI/4)
  expect(result.rectangle.center.x).toBeCloseTo(result.rectangle.center.y)
  expect(result.rectangle.width).toBeCloseTo(Math.sqrt(8))
  expect(result.rectangle.depth).toBe(.15)
  expect(result.rectangle.wallAttachment).toMatchObject({wallId:'w',openingHeight:2.1})
 })
 it('supports reversed door drags but never clamps beyond wall ends',()=>{
  const forward=projectWallDoorRectangle(wall(),{x:2,y:.1},{x:4,y:1})
  const backward=projectWallDoorRectangle(wall(),{x:4,y:1},{x:2,y:.1})
  expect(backward).toEqual(forward)
  expect(projectWallDoorRectangle(wall(),{x:9,y:0},{x:11,y:0}).ok).toBe(false)
 })
 it('projects a window onto the frozen original wall rather than a nearby wall',()=>{
  expect(projectWallWindow(wall(),{x:2,y:.1},{x:4,y:.2})).toMatchObject({ok:true,opening:{type:'window',wallId:'w',offset:2,width:2,height:1.2,sillHeight:.9}})
  expect(projectWallWindow(wall(),{x:2,y:0},{x:4,y:4}).ok).toBe(false)
 })
 it('rejects windows that exceed low walls or endpoints and collapsed door spans',()=>{
  expect(projectWallWindow(wall({height:1}),{x:2,y:0},{x:4,y:0}).ok).toBe(false)
  expect(projectWallWindow(wall(),{x:9,y:0},{x:11,y:0}).ok).toBe(false)
  expect(projectWallDoorRectangle(wall(),{x:2,y:0},{x:2.1,y:0}).ok).toBe(false)
 })
})
