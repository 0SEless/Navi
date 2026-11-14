'use client'
import {useEffect,useRef,useState} from 'react'
import type {Building,Floor,LocalCoord} from '@navi/core'
import {floorBackboneEdges,floorConnectionProblem,floorConnectionSignature,getFloorPorts,nearestFloorTarget,projectFloorPoint,suggestFloorConnections,type FloorConnectionProposal} from '@navi/editor/src/geometry/floor-connections'
/** `undoAvailable`: the latest undoable step is a connections batch (true again after Redo). When omitted,
 * the button follows this panel's own last Confirm. */
interface Props {building:Building;floor:Floor;revision:number;disabled?:boolean;undoAvailable?:boolean;onApply:(payload:Record<string,unknown>)=>{success:boolean;error?:string;revision?:number};onUndo:()=>unknown}
const buttonStyle={padding:'6px 10px',border:'1px solid var(--navi-border)',borderRadius:5,background:'var(--navi-card)',color:'var(--navi-text)',cursor:'pointer',fontSize:12}
export function FloorConnectionReview({building,floor,revision,disabled,undoAvailable,onApply,onUndo}:Props){
 const [review,setReview]=useState<{signature:string;rows:FloorConnectionProposal[]}|null>(null),[error,setError]=useState(''),[undoRevision,setUndoRevision]=useState<number|null>(null)
 const launch=useRef<HTMLButtonElement>(null),cancel=useRef<HTMLButtonElement>(null),svg=useRef<SVGSVGElement>(null),drag=useRef<string|null>(null)
 const ports=getFloorPorts(building,floor),edges=floorBackboneEdges(building,floor),signature=floorConnectionSignature(building,floor)
 const stale=!!review&&review.signature!==signature
 const points=[...ports.map(p=>p.position),...(floor.routeNetwork?.nodes??[]).map(n=>n.position),...(floor.walls??[]).flatMap(w=>[w.start,w.end])].filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))
 const minX=Math.min(0,...points.map(p=>p.x))-2,maxX=Math.max(8,...points.map(p=>p.x))+2,minY=Math.min(0,...points.map(p=>p.y))-2,maxY=Math.max(5,...points.map(p=>p.y))+2
 const width=maxX-minX,height=maxY-minY,unit=Math.max(width,height)/70
 useEffect(()=>{if(review)cancel.current?.focus();else launch.current?.focus()},[!!review])
 const open=()=>{setReview({signature,rows:suggestFloorConnections(building,floor)});setError('')}
 const patchRow=(key:string,change:Partial<FloorConnectionProposal>)=>setReview(current=>current?{...current,rows:current.rows.map(r=>r.portKey===key?{...r,...change}:r)}:null)
 const close=()=>{drag.current=null;setReview(null);setError('')}
 const pointerPoint=(x:number,y:number):LocalCoord|undefined=>{
  const rect=svg.current?.getBoundingClientRect();if(!rect||!rect.width||!rect.height)return
  const scale=Math.min(rect.width/width,rect.height/height)
  return {x:minX+(x-rect.left-(rect.width-width*scale)/2)/scale,y:maxY-(y-rect.top-(rect.height-height*scale)/2)/scale}
 }
 const move=(x:number,y:number)=>{
  if(!drag.current||stale||disabled)return
  const point=pointerPoint(x,y),port=ports.find(p=>p.key===drag.current);if(!point||!port)return
  const target=nearestFloorTarget(building,floor,point);if(!target)return
  const problem=floorConnectionProblem(port,target.position,floor)
  patchRow(port.key,{target,accepted:!problem,disconnect:false,message:problem})
 }
 const accepted=review?.rows.filter(r=>r.accepted||r.disconnect)??[]
 return <>
  <div style={{display:'flex',alignItems:'center',gap:8,padding:'5px 10px',borderBottom:'1px solid var(--navi-border)',flexShrink:0}}>
   <button ref={launch} type="button" style={buttonStyle} disabled={disabled} onClick={open}>Suggest connections</button>
   {undoAvailable!==undefined
    ? undoAvailable&&<button type="button" style={buttonStyle} disabled={disabled} onClick={()=>{if(!disabled)onUndo()}}>Undo connections</button>
    : undoRevision!==null&&<button type="button" style={buttonStyle} disabled={disabled||revision!==undoRevision} onClick={()=>{if(revision===undoRevision&&!disabled){onUndo();setUndoRevision(null)}}}>Undo connections</button>}
   <span style={{fontSize:11,color:'var(--navi-text-secondary)'}}>Review door, entrance, stair and elevator access to this floor’s routes.</span>
  </div>
  {review&&<div style={{position:'fixed',inset:0,zIndex:110,background:'#0f172a88',display:'flex',alignItems:'center',justifyContent:'center'}}>
   <div role="dialog" aria-modal="true" aria-label="Review floor connections" style={{width:'min(1180px,96vw)',height:'min(790px,94vh)',display:'flex',flexDirection:'column',background:'var(--navi-card)',color:'var(--navi-text)',borderRadius:10,boxShadow:'0 12px 40px #0005',overflow:'hidden'}}
    onKeyDown={event=>{
     event.stopPropagation()
     if(event.key==='Escape'){event.preventDefault();close()}
     if(event.key==='Tab'){const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]'));const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}
    }}>
    <header style={{padding:'12px 16px',borderBottom:'1px solid var(--navi-border)'}}><strong>Review floor connections</strong><div style={{fontSize:12,marginTop:4,color:'var(--navi-text-secondary)'}}>Temporary suggestions — drag a round endpoint along the route or choose another segment. Nothing changes until Confirm.</div></header>
    <div style={{display:'flex',flex:1,minHeight:0,minWidth:0}}>
     <svg ref={svg} role="img" aria-label="Floor connection preview" viewBox={`${minX} ${-maxY} ${width} ${height}`} style={{flex:1,minWidth:0,minHeight:0,background:'var(--navi-content)',touchAction:'none'}}
      onPointerMove={e=>move(e.clientX,e.clientY)} onPointerUp={e=>{move(e.clientX,e.clientY);drag.current=null;if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>{drag.current=null}} onLostPointerCapture={()=>{drag.current=null}}>
      {(floor.rooms??[]).map(room=><polygon key={room.id} points={room.polygon.points.map(p=>`${p.x},${-p.y}`).join(' ')} fill="#dbeafe55" stroke="none"/>)}
      {(floor.walls??[]).map(w=><line key={w.id} x1={w.start.x} y1={-w.start.y} x2={w.end.x} y2={-w.end.y} stroke="#64748b" strokeWidth={w.thickness}/>)}
      {edges.map(edge=>{const a=floor.routeNetwork?.nodes.find(n=>n.id===edge.from),b=floor.routeNetwork?.nodes.find(n=>n.id===edge.to);return a&&b?<line key={edge.id} x1={a.position.x} y1={-a.position.y} x2={b.position.x} y2={-b.position.y} stroke="#2563eb" strokeWidth={unit*.22}/>:null})}
      {review.rows.map(row=>{const port=ports.find(p=>p.key===row.portKey);if(!port)return null;const target=row.target?.position;const color=row.disconnect?'#dc2626':row.accepted?'#16a34a':row.existing?'#2563eb':'#d97706';return <g key={row.portKey}>
       {target&&<><line x1={port.position.x} y1={-port.position.y} x2={target.x} y2={-target.y} stroke={color} strokeWidth={unit*.13} strokeDasharray={row.existing&&!row.accepted?undefined:`${unit*.5} ${unit*.25}`}/>
        <circle data-testid={`connection-target-${row.portKey}`} aria-label={`Move connection for ${port.label}`} cx={target.x} cy={-target.y} r={unit*.65} fill="white" stroke={color} strokeWidth={unit*.15} style={{cursor:stale||disabled?'not-allowed':'grab'}}
         onPointerDown={e=>{if(stale||disabled||port.manualConnected)return;e.preventDefault();e.stopPropagation();drag.current=port.key;svg.current?.setPointerCapture(e.pointerId)}}/>
       </>}
       <circle cx={port.position.x} cy={-port.position.y} r={unit*.38} fill={color}/><text x={port.position.x+unit*.6} y={-port.position.y+unit*.2} fontSize={unit} fill="#334155">{port.label}</text>
      </g>})}
     </svg>
     <div style={{width:310,maxWidth:'40%',overflowY:'auto',padding:12,borderLeft:'1px solid var(--navi-border)'}}>
      {review.rows.length===0&&<p>No eligible doors, entrances, stairs or elevators are placed on this floor yet.</p>}
      {review.rows.map(row=>{const port=ports.find(p=>p.key===row.portKey);if(!port)return null;const problem=row.target&&floorConnectionProblem(port,row.target.position,floor);return <section key={row.portKey} data-port-key={row.portKey} style={{padding:'10px 0',borderBottom:'1px solid var(--navi-border)'}}>
       <label style={{fontSize:12,fontWeight:600}}><input type="checkbox" aria-label={`${row.existing?'Edit':'Include'} ${port.label}`} checked={row.accepted} disabled={disabled||stale||port.manualConnected||!row.target||!!problem} onChange={e=>patchRow(row.portKey,{accepted:e.target.checked,disconnect:false})}/> {port.label} <span style={{fontWeight:400,color:'var(--navi-text-secondary)'}}>· {port.kind}</span></label>
       {row.message&&<p style={{fontSize:11,margin:'5px 0',color:problem?'#b45309':'var(--navi-text-secondary)'}}>{row.message}</p>}
       {!port.manualConnected&&<label style={{display:'block',fontSize:11,marginTop:6}}>Route segment<select aria-label={`Route segment for ${port.label}`} value={row.target?.edgeId??''} disabled={disabled||stale} style={{width:'100%',marginTop:4}} onChange={e=>{
        const edge=edges.find(edge=>edge.id===e.target.value),a=floor.routeNetwork?.nodes.find(n=>n.id===edge?.from),b=floor.routeNetwork?.nodes.find(n=>n.id===edge?.to);if(!edge||!a||!b)return
        const position=projectFloorPoint(port.position,a.position,b.position),message=floorConnectionProblem(port,position,floor)
        patchRow(row.portKey,{target:{edgeId:edge.id,position},accepted:!message,disconnect:false,message})
       }}><option value="">Choose a segment</option>{edges.map((edge,index)=><option key={edge.id} value={edge.id}>Segment {index+1}</option>)}</select></label>}
       {port.connection&&<button type="button" aria-label={`Disconnect ${port.label}`} disabled={disabled||stale} style={{...buttonStyle,marginTop:6}} onClick={()=>patchRow(row.portKey,{disconnect:!row.disconnect,accepted:false,message:row.disconnect?'Existing connection preserved.':'Will disconnect on Confirm.'})}>{row.disconnect?'Keep connection':'Disconnect'}</button>}
      </section>})}
     </div>
    </div>
    {stale&&<div role="alert" style={{padding:'8px 16px',color:'#b45309'}}>The floor changed. Refresh suggestions before confirming. <button type="button" onClick={open}>Refresh suggestions</button></div>}
    {error&&<div role="alert" style={{padding:'8px 16px',color:'#dc2626'}}>{error}</div>}
    <footer style={{display:'flex',alignItems:'center',gap:8,padding:'12px 16px',borderTop:'1px solid var(--navi-border)'}}><span style={{fontSize:12,marginRight:'auto'}}>{accepted.length} connection changes selected · blue existing · green accepted · orange needs review</span>
     <button ref={cancel} type="button" style={buttonStyle} onClick={close}>Cancel</button>
     <button type="button" style={{...buttonStyle,background:'var(--navi-primary)',color:'white'}} disabled={disabled||stale||!accepted.length} onClick={()=>{
      const result=onApply({buildingId:building.id,floorId:floor.id,expectedSignature:review.signature,connections:accepted})
      if(!result.success){setError(result.error??'Connections could not be applied.');return}
      setUndoRevision(result.revision??revision+1);close()
     }}>Confirm connections</button>
    </footer>
   </div>
  </div>}
 </>
}
