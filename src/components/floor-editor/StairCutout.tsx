'use client'

import { useState } from 'react'
import type { Building, Staircase } from '@navi/core'
import { proposeStairCutout } from '@navi/editor/src/commands/stair-to-floor-handler'
import { stairTopReach } from '@navi/editor/src/geometry/stair-top-reach'

type Cutout = { wallId: string; offset: number; width: number }

export function StairCutout({ building, stair, onApply }: {
  building: Building
  stair: Staircase
  onApply(cutout: Cutout): { success: boolean; error?: string }
}) {
  const [draft, setDraft] = useState<{ wallId: string; offset: string; width: string }>()
  const [error, setError] = useState<string>()
  const proposal = proposeStairCutout(building, stair)
  if (stairTopReach(building, stair).ok) return <p role="status" className="m-0 text-[11px]">Landing opens onto the hallway.</p>
  if (!proposal) return null
  const { wallId, wall } = proposal
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
  const center = proposal.offset + proposal.width / 2
  const current = draft?.wallId === wallId ? draft : undefined
  const offset = Number(current?.offset)
  const width = Number(current?.width)
  const wallLabel = typeof wall.metadata?.label === 'string' ? wall.metadata.label : 'hallway wall'
  return (
    <section className="grid gap-2 rounded border border-[var(--navi-border)] p-2 text-[11px]" aria-label="Stair wall cutout">
      <button type="button" className="rounded border p-1.5 text-left" onClick={() => {
        setDraft({ wallId, offset: String(Number(proposal.offset.toFixed(3))), width: String(Number(proposal.width.toFixed(3))) })
        setError(undefined)
      }}>Preview cutout on {wallLabel}</button>
      {current && <>
        <svg viewBox="0 0 240 70" role="img" aria-label="Wall and proposed cutout in plan view" className="w-full rounded bg-[var(--navi-content)]">
          <text x="8" y="12" fill="currentColor" fontSize="9">Hallway</text>
          <path d="M 8 34 H 232" stroke="currentColor" strokeOpacity=".6" strokeWidth="7" />
          {Number.isFinite(offset + width) && width > 0 && <path d={`M ${8+224*Math.max(0,offset)/length} 34 H ${8+224*Math.min(length,offset+width)/length}`} stroke="#2fa98a" strokeWidth="7" />}
          <path d={`M ${8+224*center/length} 56 v -15`} stroke="#2fa98a" strokeWidth="2" />
          <text x="8" y="64" fill="currentColor" fontSize="9">Stair approach</text>
        </svg>
        <div className="grid grid-cols-2 gap-2">
          <label>Offset (m)<input type="number" min="0" step=".01" value={current.offset} className="w-full rounded border p-1" onChange={e=>setDraft({...current,offset:e.target.value})}/></label>
          <label>Width (m)<input type="number" min=".5" step=".01" value={current.width} className="w-full rounded border p-1" onChange={e=>setDraft({...current,width:e.target.value})}/></label>
        </div>
        {error && <div role="alert">{error}</div>}
        <div className="flex gap-2">
          <button type="button" disabled={!current.offset || !current.width} className="rounded bg-emerald-700 px-2 py-1 text-white disabled:opacity-50" onClick={()=>{
            const result = onApply({wallId,offset,width})
            if (result.success) { setDraft(undefined); setError(undefined) }
            else setError(result.error ?? 'Could not apply the cutout.')
          }}>Apply cutout</button>
          <button type="button" onClick={()=>{setDraft(undefined);setError(undefined)}}>Cancel</button>
        </div>
      </>}
    </section>
  )
}
