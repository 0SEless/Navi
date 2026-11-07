'use client'

// Preview before publishing (2026-11-07): the latest saved version as visitors will see it on NAVI Web — the same
// map, built on the server with Publish's steps and recorded nowhere — with a route test from A to B. It never
// touches the visitor store or its offline cache.
import { useEffect, useMemo, useState } from 'react'
import ExploreMap from '@/components/public/ExploreMap'
import { findRoute, parsePublicCampus } from '@/store/public-store'
import type { CampusBundle } from '@/types/nav-types'

export type PreviewResult = { ok: true; campus: unknown } | { ok: false; code: string; problems: string[] }
export type PreviewLoad = (campusId: string, commitNo: number) => Promise<PreviewResult>

export const loadPreview: PreviewLoad = async (campusId, commitNo) => {
  let response: Response
  try {
    response = await fetch('/api/studio/v2/preview', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ campusId, commitNo }), cache: 'no-store',
    })
  } catch {
    return { ok: false, code: 'NETWORK', problems: ['The preview could not be reached. Check the connection and try again.'] }
  }
  const body = (await response.json().catch(() => ({}))) as { campus?: unknown; code?: string; diagnostics?: Array<{ message?: string }> }
  if (response.ok && body.campus) return { ok: true, campus: body.campus }
  const problems = (body.diagnostics ?? []).map((d) => d.message).filter((m): m is string => Boolean(m))
  return { ok: false, code: body.code ?? `HTTP_${response.status}`, problems: problems.length > 0 ? problems : [`The preview could not be built (${body.code ?? response.status}).`] }
}

const bar: React.CSSProperties = { padding: '8px 14px', background: 'var(--navi-warning-bg, #fef3c7)', color: 'var(--navi-text, #1f2937)', fontSize: 13, fontWeight: 600, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }

export function StudioPreview({ campusId, commitNo, load = loadPreview }: { campusId: string; commitNo: number; load?: PreviewLoad }) {
  const [result, setResult] = useState<{ bundle: CampusBundle } | { problems: string[] } | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    let live = true
    void load(campusId, commitNo).then((r) => {
      if (!live) return
      if (!r.ok) return setResult({ problems: r.problems })
      const parsed = parsePublicCampus(r.campus, campusId)
      setResult(parsed ? { bundle: parsed.bundle } : { problems: ['The preview did not contain this campus.'] })
    })
    return () => { live = false }
  }, [campusId, commitNo, load])

  const bundle = result && 'bundle' in result ? result.bundle : null
  const places = useMemo(() => (bundle?.searchEntries ?? []).filter((e) => e.nodeId), [bundle])
  const route = useMemo(() => (bundle && from && to && from !== to ? findRoute(bundle.nodes, bundle.edges, from, to) : null), [bundle, from, to])
  const withStairs = useMemo(() => {
    if (!route || !bundle) return false
    // Indoor stairs are 'stairs' edges; outdoor stairs are walk edges from a road marked stairs.
    const isStairs = (e: (typeof bundle.edges)[number]) => e.type === 'stairs' || e.routing?.authored?.feature === 'stairs'
    return route.path.slice(1).some((id, i) => bundle.edges.some((e) => isStairs(e) && ((e.from === route.path[i] && e.to === id) || (e.to === route.path[i] && e.from === id))))
  }, [route, bundle])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div role="status" style={bar}>
        <span>Preview — not published. Showing save #{commitNo}.</span>
        {bundle && (
          <>
            <label>From <select aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">Pick a place</option>
              {places.map((p) => <option key={`f-${p.id}`} value={p.nodeId}>{p.label}</option>)}
            </select></label>
            <label>To <select aria-label="To" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Pick a place</option>
              {places.map((p) => <option key={`t-${p.id}`} value={p.nodeId}>{p.label}</option>)}
            </select></label>
            {from && to && from !== to && (
              <span>{route ? `Route: ${Math.round(route.totalDistance)} m${withStairs ? ', with stairs' : ''}` : 'No route between these places'}</span>
            )}
          </>
        )}
      </div>
      {!result && <div style={{ padding: 16, fontSize: 13 }}>Building the preview…</div>}
      {result && 'problems' in result && (
        <div role="alert" style={{ padding: 16, fontSize: 13 }}>
          <p style={{ fontWeight: 600 }}>Publish would be refused. Fix these first:</p>
          <ul>{result.problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {bundle && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <ExploreMap bundle={bundle} route={route ? { path: route.path, cost: route.totalDistance } : null} />
        </div>
      )}
    </div>
  )
}

/** Preview in the map editor's top bar: saved work opens at once; unsaved work asks "Save first?". */
export function PreviewButton({ mapId, dirty, headCommit, save, open }: {
  mapId: string
  dirty: boolean
  headCommit: number
  /** Saves and returns the new save number (or nothing when it failed). */
  save(): Promise<number | void> | number | void
  open(url: string): void
}) {
  const [asking, setAsking] = useState(false)
  const url = (commit: number) => `/studio/${encodeURIComponent(mapId)}/preview?commit=${commit}`
  const style: React.CSSProperties = { padding: '3px 10px', borderRadius: 4, border: '1px solid var(--navi-border)', background: 'transparent', color: 'var(--navi-text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }
  return (
    <span style={{ position: 'relative' }}>
      <button type="button" style={style} disabled={headCommit < 1 && !dirty} onClick={() => (dirty ? setAsking(true) : open(url(headCommit)))}>Preview</button>
      {asking && (
        <div role="dialog" aria-label="Save first?" style={{ position: 'absolute', top: 26, right: 0, zIndex: 40, background: 'var(--navi-card, #fff)', border: '1px solid var(--navi-border)', borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, width: 220, fontSize: 12 }}>
          <strong>Save first?</strong>
          <span>The preview shows saved work only.</span>
          <button type="button" style={style} onClick={async () => {
            setAsking(false)
            const commit = await save()
            if (typeof commit === 'number' && commit > 0) open(url(commit))
          }}>Save and preview</button>
          {headCommit > 0 && <button type="button" style={style} onClick={() => { setAsking(false); open(url(headCommit)) }}>Preview last save</button>}
          <button type="button" style={{ ...style, border: 'none' }} onClick={() => setAsking(false)}>Cancel</button>
        </div>
      )}
    </span>
  )
}
