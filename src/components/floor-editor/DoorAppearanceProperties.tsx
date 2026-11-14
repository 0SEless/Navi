'use client'
import { useEffect, useState } from 'react'
import { DOOR_PRESETS, GLASS_TYPES, OPENING_MATERIALS, OPENING_MATERIAL_COLORS, resolveDoorStyle, type RoomDoor } from '@navi/core'
import { OpeningThumbnail } from './OpeningThumbnail'

type DoorStylePatch = Partial<Pick<RoomDoor,'doorAppearance'|'doorPose'|'hingeSide'|'swingSide'|'material'|'glass'>> & { assetPreset?: string }
type Result = { success: boolean; error?: string }
/** Look fields copied by "Apply to similar doors". Hinge and swing depend on each door's spot, so they are not copied. */
const SIMILAR_FIELDS = ['assetPreset','material','glass','doorPose','doorAppearance'] as const
const MATERIAL_LABELS: Record<string,string> = { wood:'Wood', 'painted-steel':'Painted steel', aluminium:'Aluminium', 'fire-red':'Fire red' }
const isTyping=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName))

/** Appearance section for a selected door. Every control applies immediately; all of it is visual only. */
export function DoorAppearanceProperties({door,disabled=false,onUpdate,similarCount=0,onApplyToSimilar}:{
  door:RoomDoor;disabled?:boolean;onUpdate(patch:DoorStylePatch):Result
  similarCount?:number;onApplyToSimilar?(fields:readonly string[]):Result
}) {
  const archway=door.doorType==='opening'
  const style=resolveDoorStyle(door)
  const [error,setError]=useState<string|null>(null)
  const [confirming,setConfirming]=useState(false)
  const hinge=door.hingeSide??'start',swing=door.swingSide??'left'
  const locked=disabled||archway
  const report=(run:()=>Result)=>{
    try{const result=run();setError(result.success?null:result.error??'Door appearance could not be changed.')}
    catch(reason){setError(reason instanceof Error?reason.message:'Door appearance could not be changed.')}
  }
  const apply=(patch:DoorStylePatch)=>{ if(!locked)report(()=>onUpdate(patch)) }
  const flip=()=>apply({swingSide:swing==='left'?'right':'left'})
  // F flips the selected door's swing (this panel exists only while a door is selected).
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.key.toLowerCase()!=='f'||event.ctrlKey||event.metaKey||event.altKey||isTyping(event.target))return
      flip()
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  })
  const pressedStyle=(pressed:boolean)=>({border:pressed?'2px solid var(--navi-primary, #2563eb)':'1px solid var(--navi-border)',borderRadius:4,background:'var(--navi-content)',color:'var(--navi-text)'})
  const toggle=(label:string,pressed:boolean,onClick:()=>void)=><button type="button" aria-label={label} aria-pressed={pressed} disabled={locked} onClick={onClick}
    style={{flex:1,minHeight:36,fontWeight:pressed?700:400,...pressedStyle(pressed)}}>{label.replace(/^(Hinge at|Swing) /,'')}</button>
  const hasGlass=style.panel==='glass'||style.panel==='half-glass'
  const pose=archway?'open':door.doorPose??'closed'
  return <section aria-label="Door appearance properties" style={{padding:12,fontSize:12,borderTop:'1px solid var(--navi-border)'}}>
    <strong>Appearance</strong>
    <div role="group" aria-label="Door style" style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(64px,1fr))',gap:6,marginTop:8}}>
      {DOOR_PRESETS.map(preset=>{
        const pressed=door.assetPreset===preset.id
        return <button key={preset.id} type="button" aria-label={'Use '+preset.label} aria-pressed={pressed} title={preset.label} disabled={locked}
          onClick={()=>apply({assetPreset:preset.id})} style={{padding:2,...pressedStyle(pressed)}}>
          <OpeningThumbnail preset={preset} size={56}/>
          <span style={{display:'block',fontSize:10,lineHeight:1.2}}>{preset.label}</span>
        </button>
      })}
    </div>
    <div role="group" aria-label="Material" style={{marginTop:10}}>Material
      <div style={{display:'flex',gap:6,marginTop:4}}>{OPENING_MATERIALS.map(material=>{
        const pressed=style.material===material
        return <button key={material} type="button" aria-label={'Material '+material} aria-pressed={pressed} title={MATERIAL_LABELS[material]} disabled={locked}
          onClick={()=>apply({material})} style={{width:32,height:32,borderRadius:16,background:OPENING_MATERIAL_COLORS[material],border:pressed?'3px solid var(--navi-primary, #2563eb)':'1px solid var(--navi-border)'}}/>
      })}</div>
    </div>
    {hasGlass&&<label style={{display:'block',marginTop:10}}>Glass
      <select aria-label="Glass" value={style.glass} disabled={locked} onChange={event=>apply({glass:event.target.value as NonNullable<RoomDoor['glass']>})} style={{width:'100%',minHeight:36}}>
        {GLASS_TYPES.map(glass=><option key={glass} value={glass}>{glass[0].toUpperCase()+glass.slice(1)}</option>)}
      </select>
    </label>}
    <label style={{display:'block',marginTop:10}}>Door position
      <select aria-label="Door position" value={pose} disabled={locked||style.operation==='none'} onChange={event=>apply({doorPose:event.target.value as NonNullable<RoomDoor['doorPose']>})} style={{width:'100%',minHeight:36}}>
        <option value="closed">Closed</option><option value="ajar">Ajar (half open)</option><option value="open">Open (fully open)</option>
      </select>
    </label>
    {style.leaves!==2&&<div role="group" aria-label="Hinge side" style={{marginTop:10}}>Hinge
      <div style={{display:'flex',gap:6,marginTop:4}}>{toggle('Hinge at start',hinge==='start',()=>apply({hingeSide:'start'}))}{toggle('Hinge at end',hinge==='end',()=>apply({hingeSide:'end'}))}</div>
    </div>}
    <div role="group" aria-label="Swing side" style={{marginTop:10}}>Swing
      <div style={{display:'flex',gap:6,marginTop:4}}>{toggle('Swing left',swing==='left',()=>apply({swingSide:'left'}))}{toggle('Swing right',swing==='right',()=>apply({swingSide:'right'}))}</div>
    </div>
    <button type="button" aria-label="Flip swing" disabled={locked} onClick={flip} style={{width:'100%',minHeight:36,marginTop:6}}>Flip swing (F)</button>
    {onApplyToSimilar&&similarCount>0&&!locked&&(confirming
      ? <div style={{display:'flex',gap:6,marginTop:10}}>
          <button type="button" onClick={()=>{setConfirming(false);report(()=>onApplyToSimilar(SIMILAR_FIELDS))}} style={{flex:1,minHeight:36}}>{`Confirm: change ${similarCount} doors`}</button>
          <button type="button" onClick={()=>setConfirming(false)} style={{minHeight:36}}>Cancel</button>
        </div>
      : <button type="button" onClick={()=>setConfirming(true)} style={{width:'100%',minHeight:36,marginTop:10}}>{`Apply to ${similarCount} similar door${similarCount===1?'':'s'}`}</button>)}
    <p>{archway?'This doorway is an open passage.':'Style, material and position are visual only; they do not change navigation.'}</p>
    {error&&<p role="alert" style={{color:'#dc2626'}}>{error}</p>}
  </section>
}
