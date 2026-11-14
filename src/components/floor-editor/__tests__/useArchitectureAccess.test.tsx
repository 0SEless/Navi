import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useArchitectureAccess } from '../useArchitectureAccess'
const handlers=vi.hoisted(()=>({lost:undefined as undefined|((zones:string[])=>void),released:undefined as undefined|((zones:string[])=>void)}))
vi.mock('@/components/studio/v2/ZoneProvider',()=>({useZoneClient:()=>({onLost:(fn:(zones:string[])=>void)=>{handlers.lost=fn;return vi.fn()},onReleased:(fn:(zones:string[])=>void)=>{handlers.released=fn;return vi.fn()}})}))
it('disables this building after loss or release, leaving unrelated buildings alone',()=>{
 const {result}=renderHook(()=>useArchitectureAccess('b'))
 expect(result.current).toBe(true)
 act(()=>handlers.lost!(['building:other']));expect(result.current).toBe(true)
 act(()=>handlers.lost!(['building:b']));expect(result.current).toBe(false)
})
it('disables gestures and properties when this building is released',()=>{
 const {result}=renderHook(()=>useArchitectureAccess('b'))
 act(()=>handlers.released!(['building:b']));expect(result.current).toBe(false)
})
