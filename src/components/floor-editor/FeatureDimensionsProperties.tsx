'use client'
import type { StairLevelGeometry, ElevatorLevelGeometry } from '@navi/core'
import { useState } from 'react'
import { featureDimensions } from '@navi/editor/src/geometry/feature-dimensions'
type Props = { kind: 'stair'|'elevator'; geometry: StairLevelGeometry|ElevatorLevelGeometry; floorHeight?: number; disabled?: boolean; onUpdate: (patch: Record<string, unknown>) => {success:boolean;error?:string} | void }
export function FeatureDimensionsProperties({kind,geometry,floorHeight,disabled,onUpdate}: Props) {
  const dimensions=featureDimensions(geometry)
  const rise=(geometry as StairLevelGeometry).height ?? floorHeight
  const snapshot=JSON.stringify([dimensions?.width,dimensions?.depth,geometry.rotation,(geometry as StairLevelGeometry).height,floorHeight])
  const [previousSnapshot,setPreviousSnapshot]=useState(snapshot)
  const [values,setValues]=useState({width:String(dimensions?.width ?? ''),depth:String(dimensions?.depth ?? ''),rotation:String(geometry.rotation),height:String(rise ?? '')})
  const [error,setError]=useState('')
  // Guarded adjustment to changed canonical props keeps the existing input DOM
  // and focus, and lets undo replace drafts before children are committed.
  if(previousSnapshot!==snapshot){
    setPreviousSnapshot(snapshot)
    setValues({width:String(dimensions?.width ?? ''),depth:String(dimensions?.depth ?? ''),rotation:String(geometry.rotation),height:String(rise ?? '')})
    setError('')
  }
  const title=kind==='stair'?'Stair':'Elevator'
  const apply=()=>{
    if(disabled)return
    const patch:Record<string,unknown>={}
    const current={width:dimensions?.width,depth:dimensions?.depth,rotation:geometry.rotation,height:rise}
    for(const key of ['width','depth','rotation',...(kind==='stair'?['height']:[])] as (keyof typeof values)[]){
      // Unknown inherited floor rise remains unknown until the user authors one.
      if(key==='height'&&values.height===''&&rise===undefined)continue
      const value=Number(values[key])
      if(values[key].trim()===''||!Number.isFinite(value)||(key!=='rotation'&&value<=0)){setError('Enter positive sizes in meters and a finite rotation in degrees.');return}
      if(value!==current[key])patch[key]=value
    }
    if(!Object.keys(patch).length){setError('');return}
    const result=onUpdate(patch)
    setError(result?.success===false?(result.error??'Could not update dimensions.'):'')
  }
  return <section aria-label={`${title} dimensions`}>
    <div style={{fontWeight:600,fontSize:11,marginBottom:6}}>Dimensions</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(2, minmax(0, 1fr))',gap:6}}>
      {(['width','depth','rotation',...(kind==='stair'?['height']:[])] as (keyof typeof values)[]).map(key=>{
        const label=`${title} ${key==='height'?'rise height (m)':key==='rotation'?'rotation (degrees)':`${key} (m)`}`
        return <label key={key} style={{fontSize:10,color:'var(--navi-text-secondary)'}}>{key==='height'?'Rise height (m)':key==='rotation'?'Rotation (°)':`${key==='width'?'Width':'Depth'} (m)`}
          <input aria-label={label} type="number" step={key==='rotation'?1:.1} min={key==='rotation'?undefined:.01} value={values[key]} disabled={disabled}
            onChange={event=>setValues(prev=>({...prev,[key]:event.target.value}))} onBlur={apply}
            onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur()}}}
            style={{width:'100%',minWidth:0,boxSizing:'border-box',padding:'5px 6px',border:'1px solid var(--navi-border)',borderRadius:4,background:'var(--navi-content)',color:'var(--navi-text)',fontSize:11}}/>
        </label>
      })}
    </div>
    {kind==='stair'&&<>
      <p style={{fontSize:10,color:'var(--navi-text-secondary)'}}>Rise is the top step height above this floor. {floorHeight!==undefined?`Floor height: ${floorHeight} m.`:'Floor height is not set.'}</p>
      <button type="button" disabled={disabled||(geometry as StairLevelGeometry).height===undefined} onPointerDown={event=>event.preventDefault()} onClick={()=>{const result=onUpdate({height:null});setError(result?.success===false?(result.error??'Could not reset height.'):'')}}>Use floor height</button>
    </>}
    <button type="button" onPointerDown={event=>event.preventDefault()} onClick={apply} disabled={disabled} style={{marginTop:6}}>Apply dimensions</button>
    <p style={{fontSize:10,color:'var(--navi-text-secondary)'}}>Changes apply when you leave a field or press Enter. Campus Save is separate.</p>
    {error&&<p role="alert" style={{fontSize:11,color:'#dc2626'}}>{error}</p>}
  </section>
}
